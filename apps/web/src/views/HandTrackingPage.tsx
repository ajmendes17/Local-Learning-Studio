import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8], [5, 9],
  [9, 10], [10, 11], [11, 12], [9, 13],
  [13, 14], [14, 15], [15, 16], [13, 17],
  [17, 18], [18, 19], [19, 20], [0, 17],
];

type Point = { x: number; y: number };
type Direction = [number, number];
type DirectionMap = { x: [number, number, number]; y: [number, number, number] };
type Calibration = { pointing: DirectionMap; palm: DirectionMap; center: DirectionMap | null };
type CalibrationSample = { pointing: Direction; palm: Direction; center: Direction };

const CALIBRATION_KEY = "local-learning-studio.hand-pointing-calibration.v3";
const CALIBRATION_PAUSE_MS = 1500;
const QUADRANTS = [
  { name: "Upper left", x: 0.16, y: 0.18 },
  { name: "Upper right", x: 0.84, y: 0.18 },
  { name: "Lower left", x: 0.16, y: 0.82 },
  { name: "Lower right", x: 0.84, y: 0.82 },
];

function isDirectionMap(value: unknown): value is DirectionMap {
  if (!value || typeof value !== "object") return false;
  const candidate = value as DirectionMap;
  return [candidate.x, candidate.y].every(
    (coefficients) => Array.isArray(coefficients) && coefficients.length === 3 && coefficients.every(Number.isFinite),
  );
}

function isCalibration(value: unknown): value is Calibration {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Calibration;
  return isDirectionMap(candidate.pointing) && isDirectionMap(candidate.palm) &&
    (candidate.center === null || isDirectionMap(candidate.center));
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const rows = matrix.map((row, index) => [...row, vector[index] ?? 0]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row]?.[column] ?? 0) > Math.abs(rows[pivot]?.[column] ?? 0)) pivot = row;
    }
    if (Math.abs(rows[pivot]?.[column] ?? 0) < 1e-8) return null;
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const divisor = rows[column]![column]!;
    for (let item = column; item < 4; item += 1) rows[column]![item] = rows[column]![item]! / divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row]![column]!;
      for (let item = column; item < 4; item += 1) {
        rows[row]![item] = rows[row]![item]! - factor * rows[column]![item]!;
      }
    }
  }
  return [rows[0]![3]!, rows[1]![3]!, rows[2]![3]!];
}

function fitDirectionMap(directions: Direction[]): DirectionMap | null {
  if (directions.length !== QUADRANTS.length) return null;
  const features = directions.map(([x, y]) => [x, y, 1]);
  const normal = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) =>
      features.reduce((sum, feature) => sum + feature[row]! * feature[column]!, 0),
    ),
  );
  const x = solveLinearSystem(
    normal,
    features.reduce((sum, feature, index) => {
      sum[0] = (sum[0] ?? 0) + feature[0]! * QUADRANTS[index]!.x;
      sum[1] = (sum[1] ?? 0) + feature[1]! * QUADRANTS[index]!.x;
      sum[2] = (sum[2] ?? 0) + feature[2]! * QUADRANTS[index]!.x;
      return sum;
    }, [0, 0, 0]),
  );
  const y = solveLinearSystem(
    normal,
    features.reduce((sum, feature, index) => {
      sum[0] = (sum[0] ?? 0) + feature[0]! * QUADRANTS[index]!.y;
      sum[1] = (sum[1] ?? 0) + feature[1]! * QUADRANTS[index]!.y;
      sum[2] = (sum[2] ?? 0) + feature[2]! * QUADRANTS[index]!.y;
      return sum;
    }, [0, 0, 0]),
  );
  return x && y ? { x: [x[0]!, x[1]!, x[2]!], y: [y[0]!, y[1]!, y[2]!] } : null;
}

function fitCalibration(samples: CalibrationSample[]): Calibration | null {
  const pointing = fitDirectionMap(samples.map((sample) => sample.pointing));
  const palm = fitDirectionMap(samples.map((sample) => sample.palm));
  const centers = samples.map((sample) => sample.center);
  const xSpread = Math.max(...centers.map(([x]) => x)) - Math.min(...centers.map(([x]) => x));
  const ySpread = Math.max(...centers.map(([, y]) => y)) - Math.min(...centers.map(([, y]) => y));
  const center = xSpread > 0.025 && ySpread > 0.025 ? fitDirectionMap(centers) : null;
  return pointing && palm ? { pointing, palm, center } : null;
}

function indexDirection(points: Point[]): Direction | null {
  const base = points[5];
  const tip = points[8];
  if (!base || !tip) return null;
  const x = tip.x - base.x;
  const y = tip.y - base.y;
  const length = Math.hypot(x, y);
  return length > 0.001 ? [x / length, y / length] : null;
}

function palmDirection(points: Point[]): Direction | null {
  const wrist = points[0];
  const knuckles = [points[5], points[9], points[13], points[17]];
  if (!wrist || knuckles.some((point) => !point)) return null;
  const centerX = knuckles.reduce((sum, point) => sum + point!.x, 0) / knuckles.length;
  const centerY = knuckles.reduce((sum, point) => sum + point!.y, 0) / knuckles.length;
  const x = centerX - wrist.x;
  const y = centerY - wrist.y;
  const length = Math.hypot(x, y);
  return length > 0.001 ? [x / length, y / length] : null;
}

function palmCenter(points: Point[]): Direction | null {
  const wrist = points[0];
  const knuckles = [points[5], points[9], points[13], points[17]];
  if (!wrist || knuckles.some((point) => !point)) return null;
  const palmPoints = [wrist, ...knuckles] as Point[];
  return [
    palmPoints.reduce((sum, point) => sum + point.x, 0) / palmPoints.length,
    palmPoints.reduce((sum, point) => sum + point.y, 0) / palmPoints.length,
  ];
}

function mapDirection(direction: Direction, calibration: DirectionMap) {
  const [x, y] = direction;
  return {
    x: Math.max(0, Math.min(1, calibration.x[0] * x + calibration.x[1] * y + calibration.x[2])),
    y: Math.max(0, Math.min(1, calibration.y[0] * x + calibration.y[1] * y + calibration.y[2])),
  };
}

function stableQuadrantName(x: number, y: number, current: string | null) {
  const currentLeft = current ? current.endsWith("left") : null;
  const currentUpper = current ? current.startsWith("Upper") : null;
  // Give the right column a slightly easier entry while retaining a wider stay zone.
  const left = currentLeft === null ? x < 0.47 : currentLeft ? x < 0.53 : x < 0.38;
  const upper = currentUpper === null ? y < 0.5 : currentUpper ? y < 0.58 : y < 0.42;
  return `${upper ? "Upper" : "Lower"} ${left ? "left" : "right"}`;
}

function classifyGesture(points: Point[]): string {
  const wrist = points[0];
  if (!wrist || points.length < 21) return "Unclear";

  const fingerPairs: Array<{ tip: number; joint: number }> = [
    { tip: 8, joint: 6 }, // index tip and PIP joint
    { tip: 12, joint: 10 },
    { tip: 16, joint: 14 },
    { tip: 20, joint: 18 },
  ];
  const extended = fingerPairs.map(({ tip: tipIndex, joint: jointIndex }) => {
    const tip = points[tipIndex];
    const joint = points[jointIndex];
    if (!tip || !joint) return false;
    const tipDistance = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const jointDistance = Math.hypot(joint.x - wrist.x, joint.y - wrist.y);
    return tipDistance > jointDistance * 1.12;
  });
  const thumbTip = points[4];
  const thumbJoint = points[3];
  const thumbExtended = thumbTip && thumbJoint
    ? Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y) >
      Math.hypot(thumbJoint.x - wrist.x, thumbJoint.y - wrist.y) * 1.12
    : false;
  const [index, middle, ring, pinky] = extended;

  if (index && !middle && !ring && !pinky) return "Pointing";
  if (index && middle && ring && pinky && thumbExtended) return "Open hand";
  return "Closed fist";
}

type DemoState = "idle" | "starting" | "running" | "error";

export function HandTrackingPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const [state, setState] = useState<DemoState>("idle");
  const [message, setMessage] = useState("Camera is off");
  const [handCount, setHandCount] = useState(0);
  const [handLabel, setHandLabel] = useState("—");
  const [gestureLabel, setGestureLabel] = useState("—");
  const [calibration, setCalibration] = useState<Calibration | null>(() => {
    try {
      const saved = window.localStorage.getItem(CALIBRATION_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      return isCalibration(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [calibrationStep, setCalibrationStep] = useState<number | null>(null);
  const [calibrationPointing, setCalibrationPointing] = useState(false);
  const [calibrationWaiting, setCalibrationWaiting] = useState(false);
  const [pointedTarget, setPointedTarget] = useState("—");
  const [mappedPoint, setMappedPoint] = useState<Point | null>(null);
  const [activeQuadrant, setActiveQuadrant] = useState<string | null>(null);
  const [activeGesture, setActiveGesture] = useState<"pointing" | "open" | "closed" | null>(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const lastGridUpdateRef = useRef(0);
  const smoothedPointRef = useRef<Point | null>(null);
  const activeQuadrantRef = useRef<string | null>(null);
  const calibrationRef = useRef(calibration);
  const calibrationSessionRef = useRef<{
    step: number;
    startedAt: number | null;
    pauseUntil: number;
    needsRearm: boolean;
    lastCapturedDirection: Direction | null;
    directions: CalibrationSample[];
    captured: CalibrationSample[];
  } | null>(null);

  function stopCamera() {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHandCount(0);
    setHandLabel("—");
    setGestureLabel("—");
    calibrationSessionRef.current = null;
    setCalibrationStep(null);
    setCalibrationPointing(false);
    setCalibrationWaiting(false);
    setPointedTarget("—");
    setMappedPoint(null);
    setActiveQuadrant(null);
    smoothedPointRef.current = null;
    activeQuadrantRef.current = null;
    setState("idle");
    setMessage("Camera is off");
  }

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    landmarkerRef.current?.close();
  }, []);

  useEffect(() => {
    if (!gridExpanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGridExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [gridExpanded]);

  async function startCamera() {
    setState("starting");
    setMessage("Loading the hand model…");
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm",
      );
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });
      landmarkerRef.current = landmarker;
      setMessage("Waiting for camera permission…");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("The camera preview could not be initialized.");
      video.srcObject = stream;
      await video.play();
      setState("running");
      setMessage("Show your hand to the camera");

      const drawFrame = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context || !video || !landmarkerRef.current) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          context.clearRect(0, 0, canvas.width, canvas.height);
          const result = landmarkerRef.current.detectForVideo(video, performance.now());
          const count = result.landmarks.length;
          const gestures = result.landmarks.map(classifyGesture);
          const firstHand = result.landmarks[0];
          const direction = firstHand
            ? indexDirection(firstHand)
            : null;
          const palm = firstHand ? palmDirection(firstHand) : null;
          const center = firstHand ? palmCenter(firstHand) : null;
          setHandCount(count);
          setHandLabel(
            count
              ? result.handedness.map((hand) => hand[0]?.categoryName ?? "Hand").join(" · ")
              : "—",
          );
          setGestureLabel(count ? gestures.join(" · ") : "—");

          const calibrationSession = calibrationSessionRef.current;
          const updateGrid = (point: Point | null, gesture: "pointing" | "open" | "closed" | null, now: number) => {
            if (now - lastGridUpdateRef.current < 75) return;
            lastGridUpdateRef.current = now;
            if (!point) {
              smoothedPointRef.current = null;
              activeQuadrantRef.current = null;
              setMappedPoint(null);
              setActiveQuadrant(null);
              setActiveGesture(null);
              setPointedTarget("—");
              return;
            }
            const previous = smoothedPointRef.current;
            const smoothed = previous
              ? { x: previous.x * 0.7 + point.x * 0.3, y: previous.y * 0.7 + point.y * 0.3 }
              : point;
            const quadrant = stableQuadrantName(smoothed.x, smoothed.y, activeQuadrantRef.current);
            smoothedPointRef.current = smoothed;
            activeQuadrantRef.current = quadrant;
            setMappedPoint(smoothed);
            setActiveQuadrant(quadrant);
            setActiveGesture(gesture);
            setPointedTarget(
              `${gesture === "pointing" ? "Point" : gesture === "open" ? "Open hand" : "Closed fist"} · ${quadrant} · x ${Math.round(smoothed.x * 100)}%, y ${Math.round(smoothed.y * 100)}%`,
            );
          };
          if (calibrationSession) {
            const now = performance.now();
            updateGrid(null, null, now);
            const isPointing = gestures[0] === "Pointing" && direction !== null && palm !== null;
            if (calibrationSession.needsRearm) {
              if (!isPointing) calibrationSession.needsRearm = false;
              else if (
                direction && calibrationSession.lastCapturedDirection &&
                Math.hypot(
                  direction[0] - calibrationSession.lastCapturedDirection[0],
                  direction[1] - calibrationSession.lastCapturedDirection[1],
                ) > 0.22
              ) calibrationSession.needsRearm = false;
            }
            const waiting = calibrationSession.needsRearm || now < calibrationSession.pauseUntil;
            setCalibrationWaiting(waiting);
            const canCapture = isPointing && !waiting;
            setCalibrationPointing(canCapture);
            if (canCapture && direction && palm && center) {
              calibrationSession.startedAt ??= now;
              calibrationSession.directions.push({ pointing: direction, palm, center });
              if (
                now - calibrationSession.startedAt >= 900 &&
                calibrationSession.directions.length >= 8
              ) {
                const directions = calibrationSession.directions;
                const capturedSample: CalibrationSample = {
                  pointing: [
                    directions.reduce((sum, value) => sum + value.pointing[0], 0) / directions.length,
                    directions.reduce((sum, value) => sum + value.pointing[1], 0) / directions.length,
                  ],
                  palm: [
                    directions.reduce((sum, value) => sum + value.palm[0], 0) / directions.length,
                    directions.reduce((sum, value) => sum + value.palm[1], 0) / directions.length,
                  ],
                  center: [
                    directions.reduce((sum, value) => sum + value.center[0], 0) / directions.length,
                    directions.reduce((sum, value) => sum + value.center[1], 0) / directions.length,
                  ],
                };
                calibrationSession.captured.push(capturedSample);
                calibrationSession.step += 1;
                calibrationSession.startedAt = null;
                calibrationSession.directions = [];
                if (calibrationSession.step >= QUADRANTS.length) {
                  const fitted = fitCalibration(calibrationSession.captured);
                  calibrationSessionRef.current = null;
                  setCalibrationPointing(false);
                  setCalibrationWaiting(false);
                  setCalibrationStep(null);
                  if (fitted) {
                    calibrationRef.current = fitted;
                    setCalibration(fitted);
                    window.localStorage.setItem(CALIBRATION_KEY, JSON.stringify(fitted));
                    setPointedTarget("Calibration saved");
                  } else {
                    setPointedTarget("Could not calibrate · try again");
                  }
                } else {
                  calibrationSession.lastCapturedDirection = capturedSample.pointing;
                  calibrationSession.needsRearm = true;
                  calibrationSession.pauseUntil = now + CALIBRATION_PAUSE_MS;
                  setCalibrationWaiting(true);
                  setCalibrationStep(calibrationSession.step);
                }
              }
            } else {
              calibrationSession.startedAt = null;
              calibrationSession.directions = [];
            }
          } else if (isCalibration(calibrationRef.current)) {
            const isPointing = gestures[0] === "Pointing";
            const isOpen = gestures[0] === "Open hand";
            const feature = isPointing ? direction : !isPointing && calibrationRef.current.center ? center : palm;
            const map = isPointing ? calibrationRef.current.pointing : !isPointing && calibrationRef.current.center ? calibrationRef.current.center : calibrationRef.current.palm;
            const mapped = feature ? mapDirection(feature, map) : null;
            updateGrid(mapped, isPointing ? "pointing" : isOpen ? "open" : "closed", performance.now());
          } else {
            updateGrid(null, null, performance.now());
          }
          if (count) setMessage("Hand detected · showing 21 landmarks per hand");
          else setMessage("Show your hand to the camera");

          for (const landmarks of result.landmarks) {
            context.lineWidth = Math.max(3, canvas.width / 240);
            context.strokeStyle = "#a9d8ad";
            context.fillStyle = "#fff3ce";
            for (const [start, end] of HAND_CONNECTIONS) {
              const from = landmarks[start];
              const to = landmarks[end];
              if (!from || !to) continue;
              context.beginPath();
              context.moveTo(from.x * canvas.width, from.y * canvas.height);
              context.lineTo(to.x * canvas.width, to.y * canvas.height);
              context.stroke();
            }
            for (const point of landmarks) {
              context.beginPath();
              context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 180), 0, Math.PI * 2);
              context.fill();
            }
          }
        }
        animationRef.current = requestAnimationFrame(drawFrame);
      };
      animationRef.current = requestAnimationFrame(drawFrame);
    } catch (error) {
      stopCamera();
      setState("error");
      setMessage((error as Error).message || "Could not start hand tracking.");
    }
  }

  function startCalibration() {
    if (state !== "running") return;
    calibrationSessionRef.current = {
      step: 0,
      startedAt: null,
      pauseUntil: 0,
      needsRearm: false,
      lastCapturedDirection: null,
      directions: [],
      captured: [],
    };
    setCalibrationPointing(false);
    setCalibrationWaiting(false);
    setPointedTarget("Calibration in progress");
    setMappedPoint(null);
    setActiveQuadrant(null);
    smoothedPointRef.current = null;
    activeQuadrantRef.current = null;
    setCalibrationStep(0);
  }

  function resetCalibration() {
    window.localStorage.removeItem(CALIBRATION_KEY);
    calibrationRef.current = null;
    setCalibration(null);
    setPointedTarget("—");
    setMappedPoint(null);
    setActiveQuadrant(null);
    smoothedPointRef.current = null;
    activeQuadrantRef.current = null;
  }

  return (
    <main className="hand-demo-page">
      <section className="hand-demo-intro">
        <p className="eyebrow">Local experiment · Camera stays in this tab</p>
        <h1>Try hand tracking.</h1>
        <p>Turn on your camera and try pointing, opening your palm, or making a fist. The demo labels the gesture and draws the hand landmarks live.</p>
      </section>

      <section className="hand-demo-layout" aria-label="Hand tracking demonstration">
        <div className="hand-camera-panel">
          <div className="hand-camera-frame">
            <video ref={videoRef} playsInline muted aria-label="Mirrored camera preview" />
            <canvas ref={canvasRef} aria-hidden="true" />
            {state !== "running" && (
              <div className="hand-camera-placeholder">
                <span aria-hidden="true">✳</span>
                <strong>{state === "starting" ? "Getting things ready" : "Camera preview"}</strong>
                <small>{state === "starting" ? "Allow camera access when your browser asks" : "Your video appears here when you start"}</small>
              </div>
            )}
          </div>
          <div className="hand-camera-controls">
            <div className={`hand-live-indicator ${state === "running" ? "is-live" : ""}`}>
              <span />{state === "running" ? "Tracking live" : "Ready when you are"}
            </div>
            {state === "running" ? (
              <button className="button-secondary" type="button" onClick={stopCamera}>Turn camera off</button>
            ) : (
              <button className="button-primary" type="button" onClick={startCamera} disabled={state === "starting"}>
                {state === "starting" ? "Starting…" : "Turn camera on"}
              </button>
            )}
          </div>
        </div>

        <aside className="hand-readout">
          <p className="section-kicker">What the model sees</p>
          <h2>{handCount ? `${handCount} ${handCount === 1 ? "hand" : "hands"}` : "No hand yet"}</h2>
          <p className="hand-status-copy" role="status">{message}</p>
          <div className="hand-readout-rule" />
          <dl>
            <div><dt>Handedness</dt><dd>{handLabel}</dd></div>
            <div><dt>Gesture</dt><dd aria-live="polite">{gestureLabel}</dd></div>
            <div><dt>Browser target</dt><dd aria-live="polite">{pointedTarget}</dd></div>
            <div><dt>Landmarks</dt><dd>{handCount ? `${handCount * 21} points` : "—"}</dd></div>
            <div><dt>Model</dt><dd>MediaPipe</dd></div>
          </dl>
          <div className="hand-tip"><span aria-hidden="true">↗</span><p>Keep your palm in view with a little space around your fingers. Try moving it slowly and watch the points follow.</p></div>
        </aside>
      </section>
      <section className="hand-calibration-card" aria-label="Pointing calibration">
        <div>
          <p className="section-kicker">Pointing setup</p>
          <h2>{isCalibration(calibration) ? "Screen points calibrated" : "Teach the page your pointing angle"}</h2>
          <p>With the camera on, point at four targets in the browser window. Hold each target until it captures; the demo pauses and waits for a new aim before advancing. The same setup also records your wrist and knuckle center so open hands and fists can use their position without a separate pose calibration.</p>
          <small>This identifies browser viewport quadrants; web pages cannot read macOS desktop coordinates.</small>
        </div>
        <div className="hand-calibration-actions">
          <button className="button-primary" type="button" onClick={startCalibration} disabled={state !== "running" || calibrationStep !== null}>
            {calibrationStep !== null ? "Calibration running…" : isCalibration(calibration) ? "Calibrate again" : "Calibrate pointing"}
          </button>
          {isCalibration(calibration) && <button className="button-secondary" type="button" onClick={resetCalibration}>Clear calibration</button>}
          {state !== "running" && <small>Turn on the camera to begin.</small>}
        </div>
      </section>
      <section
        className={`hand-grid-card ${gridExpanded ? "is-expanded" : ""}`}
        aria-label="Live pointing grid"
        role={gridExpanded ? "dialog" : undefined}
        aria-modal={gridExpanded || undefined}
      >
        <div className="hand-grid-heading">
          <div>
            <p className="section-kicker">Calibration monitor</p>
            <h2>Live pointing grid</h2>
            <p>The highlighted quadrant shows the estimated hand location. Its color identifies the gesture; corner markers show the four reference targets.</p>
          </div>
          <div className="hand-grid-readout" aria-live="polite">
            <small>ESTIMATED BROWSER LOCATION</small>
            <strong>{pointedTarget}</strong>
          </div>
          <button
            className="button-secondary hand-grid-expand"
            type="button"
            onClick={() => setGridExpanded((expanded) => !expanded)}
            disabled={!isCalibration(calibration)}
          >
            {gridExpanded ? "Close grid" : "Expand grid"}
          </button>
        </div>
        <div className="hand-grid-legend" aria-label="Gesture colors">
          <span className="is-pointing">Point</span><span className="is-open">Open hand</span><span className="is-closed">Closed fist</span>
        </div>
        <div className="hand-grid-map" role="img" aria-label={mappedPoint ? `Estimated hand location: ${pointedTarget}` : "Four quadrant grid waiting for a calibrated hand pose"}>
          {QUADRANTS.map((quadrant) => (
            <div className={`hand-grid-quadrant ${activeQuadrant === quadrant.name ? `is-active is-active--${activeGesture}` : ""}`} key={quadrant.name}>
              <span>{quadrant.name}</span>
              {activeQuadrant === quadrant.name && <strong>{activeGesture === "pointing" ? "POINT" : activeGesture === "open" ? "OPEN HAND" : "CLOSED FIST"}</strong>}
            </div>
          ))}
          {QUADRANTS.map((quadrant) => (
            <span
              className="hand-grid-reference"
              key={`reference-${quadrant.name}`}
              style={{ left: `${quadrant.x * 100}%`, top: `${quadrant.y * 100}%` }}
              aria-hidden="true"
            />
          ))}
          {!isCalibration(calibration) && (
            <div className="hand-grid-empty">Calibrate the four corners to activate quadrant highlighting.</div>
          )}
          {isCalibration(calibration) && !activeQuadrant && (
            <div className="hand-grid-empty">{state === "running" ? "Show a tracked hand pose to highlight its estimated quadrant." : "Turn on the camera to highlight a quadrant."}</div>
          )}
        </div>
        <p className="hand-grid-footnote">This grid represents the browser viewport. Calibration accounts for the camera angle; smoothing and a small boundary buffer keep the active quadrant from flickering when the estimate is near a divider.</p>
      </section>
      {calibrationStep !== null && (
        <div className="hand-calibration-overlay" role="dialog" aria-modal="true" aria-labelledby="calibration-title">
          <div className="hand-calibration-prompt">
            <p className="section-kicker">Target {calibrationStep + 1} of {QUADRANTS.length}</p>
            <h2 id="calibration-title">Point to the {QUADRANTS[calibrationStep]!.name.toLowerCase()} target</h2>
            <p>{calibrationWaiting ? "Corner saved. Reposition; the next target will start after a short pause." : calibrationPointing ? "Hold steady…" : "Make a pointing gesture and hold it steady."}</p>
            <div className="hand-calibration-progress"><span style={{ width: `${(calibrationStep / QUADRANTS.length) * 100}%` }} /></div>
              <button className="button-secondary" type="button" onClick={() => { calibrationSessionRef.current = null; setCalibrationStep(null); setCalibrationPointing(false); setCalibrationWaiting(false); setPointedTarget("—"); }}>Cancel setup</button>
          </div>
          {QUADRANTS.map((quadrant, index) => (
            <div
              className={`hand-calibration-target ${index === calibrationStep ? "is-active" : index < calibrationStep ? "is-complete" : ""}`}
              key={quadrant.name}
              style={{ left: `${quadrant.x * 100}%`, top: `${quadrant.y * 100}%` }}
              aria-hidden="true"
            >
              <span>{index < calibrationStep ? "✓" : "＋"}</span>
              <small>{quadrant.name}</small>
            </div>
          ))}
        </div>
      )}
      <p className="hand-privacy-note">The camera feed is processed in your browser and is not recorded or sent to the Local Learning Studio server. The demo downloads its model and runtime files when started.</p>
    </main>
  );
}
