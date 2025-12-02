// ========================================
// GLOBAL VARIABLES
// ========================================

console.log('sketch.js loaded!');
console.log('p5 available:', typeof p5 !== 'undefined');
console.log('anime available:', typeof anime !== 'undefined');
console.log('ml5 available:', typeof ml5 !== 'undefined');

let video;
let faceDetector;
let faces = [];
let modelsLoaded = false;

// Character properties (animated with anime.js)
let character = {
    leftEyebrowY: 0,
    rightEyebrowY: 0,
    leftEyebrowAngle: 0,
    rightEyebrowAngle: 0,
    eyeSize: 1.1,
    pupilOffsetX: 0,
    pupilOffsetY: 0,
    mouthY: -20,
    mouthHeight: 10,
    mouthCurve: 0,
    // Expression-specific visual properties
    eyebrowThickness: 20,
    eyebrowCurvature: 0, // 0 = straight, >0 = curved down (sad)
    eyebrowColor: 0 // 0 = black
};

let currentExpression = "NEUTRAL";
let mouthOpen = 0;
let leftEyeOpen = 1;
let rightEyeOpen = 1;

// Expression state locking
let expressionLock = {
    lockedExpression: "NEUTRAL",
    lockStartTime: 0,
    minLockDuration: 200, // Hold expression for minimum 200ms
    confidenceThreshold: 0.8
};

// === AGGRESSIVE SMOOTHING SYSTEM ===
// Store previous values for EMA smoothing
let smoothedValues = {
    leftBrowY: 0,
    rightBrowY: 0,
    leftBrowAngle: 0,
    rightBrowAngle: 0,
    initialized: false
};

// Store previous positions for velocity calculation
let previousValues = {
    leftBrowY: 0,
    rightBrowY: 0,
    leftBrowAngle: 0,
    rightBrowAngle: 0
};

// Frame buffer for multi-frame averaging (last 3 frames)
let frameBuffer = {
    leftBrowY: [],
    rightBrowY: [],
    leftBrowAngle: [],
    rightBrowAngle: [],
    maxSize: 3
};

// Hysteresis system - tracks sustained changes
let hysteresis = {
    leftBrowY: {current: 0, target: 0, frames: 0},
    rightBrowY: {current: 0, target: 0, frames: 0},
    leftBrowAngle: {current: 0, target: 0, frames: 0},
    rightBrowAngle: {current: 0, target: 0, frames: 0},
    threshold: 2.0,  // Must change by this amount to trigger
    sustainFrames: 2  // Must be sustained for this many frames
};


// ========================================
// SETUP (runs once)
// ========================================

function setup() {
    console.log('Setup function called!');

    createCanvas(400, 600);
    console.log('Canvas created');

    video = createCapture(VIDEO);
    video.size(400, 600);
    video.hide();
    console.log('Video created');

    // Load face detection after a delay
    setTimeout(initializeFaceDetection, 2000);
}

// Initialize face detection separately
async function initializeFaceDetection() {
    console.log('Initializing face detection...');

    // Wait for ml5 to be available
    let attempts = 0;
    while (typeof ml5 === 'undefined' && attempts < 50) {
        console.log('Waiting for ml5... attempt', attempts);
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (typeof ml5 === 'undefined') {
        console.error('ml5 failed to load after 5 seconds!');
        return;
    }

    console.log('ml5 is now available!');
    console.log('ml5 version:', ml5.version);
    console.log('Starting to load ml5 FaceMesh model...');

    // Load faceMesh with ml5 v1.x API
    try {
        const options = {
            maxFaces: 1,
            refineLandmarks: false,
            flipped: false
        };

        console.log('Creating faceMesh instance...');
        faceDetector = ml5.faceMesh(options);

        console.log('Waiting for model to load...');
        await faceDetector.ready;

        console.log('FaceMesh Model Loaded!');
        modelsLoaded = true;

        const statusDiv = document.getElementById('status');
        if (statusDiv) {
            statusDiv.textContent = 'Model loaded! Make expressions!';
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 2000);
        }

        // Start detecting faces with the correct v1.x API
        console.log('Starting continuous detection...');
        faceDetector.detectStart(video.elt, gotFaces);
        console.log('Face detection started!');

    } catch (error) {
        console.error('Error loading FaceMesh:', error);
        console.error('Error details:', error.message, error.stack);
    }
}

function gotFaces(results) {
    faces = results;

    if (faces.length > 0) {
        analyzeFaceExpression(faces[0]);
    }
}

// ========================================
// DRAW (runs every frame)
// ========================================

function draw() {
    drawBackground();
    drawCharacter();

    // === DEBUG VISUALIZATION ===
    fill(255);
    textAlign(LEFT);
    textSize(18);

    // Expression state - color-coded
    let expressionColor;
    switch(currentExpression) {
        case 'ANGRY':
            expressionColor = color(255, 100, 100);
            break;
        case 'SAD':
            expressionColor = color(100, 150, 255);
            break;
        case 'SURPRISED':
            expressionColor = color(255, 200, 100);
            break;
        case 'NEUTRAL':
            expressionColor = color(150, 255, 150);
            break;
        default:
            expressionColor = color(200, 200, 200);
    }

    fill(expressionColor);
    textSize(24);
    textAlign(CENTER);
    text(`EXPRESSION: ${currentExpression}`, width/2, 40);

    // Face detection status
    fill(255);
    textSize(14);
    textAlign(LEFT);
    if (faces.length > 0) {
        text("✓ Face detected", 10, height - 20);
    } else {
        text("✗ No face detected", 10, height - 20);
    }

    // Debug values
    text(`L Brow Y: ${character.leftEyebrowY.toFixed(1)} | Angle: ${character.leftEyebrowAngle.toFixed(1)}°`, 10, height - 40);
    text(`R Brow Y: ${character.rightEyebrowY.toFixed(1)} | Angle: ${character.rightEyebrowAngle.toFixed(1)}°`, 10, height - 60);
}


// ========================================
// ULTRA-AGGRESSIVE SMOOTHING FUNCTIONS
// ========================================

// Add value to frame buffer and return average of last N frames
function addToFrameBuffer(bufferArray, value, maxSize) {
    bufferArray.push(value);
    if (bufferArray.length > maxSize) {
        bufferArray.shift(); // Remove oldest
    }

    // Return average of all frames in buffer
    const sum = bufferArray.reduce((acc, val) => acc + val, 0);
    return sum / bufferArray.length;
}

// Hysteresis filter - only update if change is sustained
function applyHysteresis(current, target, hysteresisObj, threshold, sustainFrames) {
    const delta = Math.abs(target - current);

    if (delta > threshold) {
        // Significant change detected
        if (Math.abs(hysteresisObj.target - target) < 0.5) {
            // Same target as before - increment frame counter
            hysteresisObj.frames++;
        } else {
            // New target - reset counter
            hysteresisObj.target = target;
            hysteresisObj.frames = 1;
        }

        // Only accept change if sustained for required frames
        if (hysteresisObj.frames >= sustainFrames) {
            return target;
        }
    } else {
        // Change too small - reset
        hysteresisObj.frames = 0;
    }

    return current; // Keep current value
}

// Multi-stage ultra-aggressive smoothing
function smoothValue(current, previous, smoothed, name) {
    // STAGE 1: Dead zone filter (increased threshold)
    const DEAD_ZONE = 1.5; // Increased from 0.5
    const delta = Math.abs(current - previous);

    if (delta < DEAD_ZONE) {
        return smoothed; // No change if movement too small
    }

    // STAGE 2: Frame buffer averaging
    const buffered = addToFrameBuffer(frameBuffer[name], current, frameBuffer.maxSize);

    // STAGE 3: Velocity-based alpha calculation (more aggressive)
    const velocity = Math.abs(buffered - smoothed);
    let alpha;

    if (velocity < 1) {
        alpha = 0.08; // VERY strong smoothing for tiny movements
    } else if (velocity < 3) {
        alpha = 0.15; // Strong smoothing for slow movements
    } else if (velocity > 15) {
        alpha = 0.5; // Medium smoothing for fast movements (still responsive)
    } else {
        // Interpolate between 0.15 and 0.5 based on velocity
        alpha = map(velocity, 3, 15, 0.15, 0.5);
    }

    // STAGE 4: Exponential Moving Average
    const emaSmoothed = smoothed * alpha + buffered * (1 - alpha);

    // STAGE 5: Hysteresis - require sustained change
    const hysteresisObj = hysteresis[name];
    const finalValue = applyHysteresis(
        smoothed,
        emaSmoothed,
        hysteresisObj,
        hysteresis.threshold,
        hysteresis.sustainFrames
    );

    return finalValue;
}


// ========================================
// EXPRESSION CLASSIFICATION
// ========================================

function detectEyebrowExpression(leftBrowY, rightBrowY, leftBrowAngle, rightBrowAngle, interBrowDist) {
    // Check if we're still in lock period
    const now = millis();
    if (now - expressionLock.lockStartTime < expressionLock.minLockDuration) {
        return expressionLock.lockedExpression;
    }

    // Use absolute thresholds instead of baseline-relative
    const avgY = (leftBrowY + rightBrowY) / 2;
    const avgAngle = (leftBrowAngle + rightBrowAngle) / 2;

    let detectedExpression = 'NEUTRAL';
    let confidence = 0;

    // Check for clear expression states with confidence scores
    // SURPRISED: Significantly raised eyebrows
    if (avgY < -15) {
        detectedExpression = 'SURPRISED';
        confidence = constrain(map(avgY, -15, -40, 0.8, 1.0), 0, 1);
    }
    // ANGRY: Strong downward inner slope
    else if (avgAngle < -8) {
        detectedExpression = 'ANGRY';
        confidence = constrain(map(Math.abs(avgAngle), 8, 20, 0.8, 1.0), 0, 1);
    }
    // SAD: Inner raised creating inverted V
    else if (avgAngle > 6) {
        detectedExpression = 'SAD';
        confidence = constrain(map(avgAngle, 6, 15, 0.8, 1.0), 0, 1);
    }
    // NEUTRAL: Within normal range
    else if (Math.abs(avgY) < 10 && Math.abs(avgAngle) < 5) {
        detectedExpression = 'NEUTRAL';
        confidence = 0.9;
    }

    // Lock expression if confidence is high
    if (confidence >= expressionLock.confidenceThreshold && detectedExpression !== expressionLock.lockedExpression) {
        expressionLock.lockedExpression = detectedExpression;
        expressionLock.lockStartTime = now;
    }

    return detectedExpression;
}

// ========================================
// ANALYZE FACE EXPRESSION
// ========================================

function analyzeFaceExpression(face) {
    const keypoints = face.keypoints;

    // === EYEBROW TRACKING ===
    // Left eyebrow keypoints (outer to inner)
    const leftBrowOuter = keypoints[70];   // Outer left eyebrow
    const leftBrowMiddle = keypoints[63];  // Middle left eyebrow
    const leftBrowInner = keypoints[105];  // Inner left eyebrow

    // Right eyebrow keypoints (inner to outer)
    const rightBrowInner = keypoints[334]; // Inner right eyebrow
    const rightBrowMiddle = keypoints[293]; // Middle right eyebrow
    const rightBrowOuter = keypoints[300]; // Outer right eyebrow

    // Reference points (eyes for relative positioning)
    const leftEyeCenter = keypoints[159];  // Left eye top
    const rightEyeCenter = keypoints[386]; // Right eye top

    // Calculate LEFT eyebrow position and angle
    // Y position: how high/low the eyebrow is relative to eye
    const leftBrowAvgY = (leftBrowOuter.y + leftBrowMiddle.y + leftBrowInner.y) / 3;
    const leftBrowRelativeY = leftEyeCenter.y - leftBrowAvgY; // Distance from eye to brow

    // Angle: slope of the eyebrow
    const leftBrowAngle = atan2(leftBrowInner.y - leftBrowOuter.y, leftBrowInner.x - leftBrowOuter.x);

    // Calculate RIGHT eyebrow position and angle
    const rightBrowAvgY = (rightBrowOuter.y + rightBrowMiddle.y + rightBrowInner.y) / 3;
    const rightBrowRelativeY = rightEyeCenter.y - rightBrowAvgY;

    const rightBrowAngle = atan2(rightBrowOuter.y - rightBrowInner.y, rightBrowOuter.x - rightBrowInner.x);

    // Calculate inter-eyebrow distance
    const interBrowDistance = dist(leftBrowInner.x, leftBrowInner.y, rightBrowInner.x, rightBrowInner.y);

    // Map to character coordinates
    let leftBrowY_raw = map(leftBrowRelativeY, 20, 50, -40, 20);
    let rightBrowY_raw = map(rightBrowRelativeY, 20, 50, -40, 20);
    let leftBrowAngle_raw = degrees(leftBrowAngle) * 0.5;
    let rightBrowAngle_raw = -degrees(rightBrowAngle) * 0.5;

    // Initialize smoothed values on first frame
    if (!smoothedValues.initialized) {
        smoothedValues.leftBrowY = leftBrowY_raw;
        smoothedValues.rightBrowY = rightBrowY_raw;
        smoothedValues.leftBrowAngle = leftBrowAngle_raw;
        smoothedValues.rightBrowAngle = rightBrowAngle_raw;
        smoothedValues.initialized = true;

        previousValues.leftBrowY = leftBrowY_raw;
        previousValues.rightBrowY = rightBrowY_raw;
        previousValues.leftBrowAngle = leftBrowAngle_raw;
        previousValues.rightBrowAngle = rightBrowAngle_raw;
    }

    // Apply smoothing
    smoothedValues.leftBrowY = smoothValue(leftBrowY_raw, previousValues.leftBrowY, smoothedValues.leftBrowY, 'leftBrowY');
    smoothedValues.rightBrowY = smoothValue(rightBrowY_raw, previousValues.rightBrowY, smoothedValues.rightBrowY, 'rightBrowY');
    smoothedValues.leftBrowAngle = smoothValue(leftBrowAngle_raw, previousValues.leftBrowAngle, smoothedValues.leftBrowAngle, 'leftBrowAngle');
    smoothedValues.rightBrowAngle = smoothValue(rightBrowAngle_raw, previousValues.rightBrowAngle, smoothedValues.rightBrowAngle, 'rightBrowAngle');

    // Update previous values
    previousValues.leftBrowY = leftBrowY_raw;
    previousValues.rightBrowY = rightBrowY_raw;
    previousValues.leftBrowAngle = leftBrowAngle_raw;
    previousValues.rightBrowAngle = rightBrowAngle_raw;

    // Detect expression
    const expression = detectEyebrowExpression(
        smoothedValues.leftBrowY,
        smoothedValues.rightBrowY,
        smoothedValues.leftBrowAngle,
        smoothedValues.rightBrowAngle,
        interBrowDistance
    );

    currentExpression = expression;

    // Apply smoothed values to character
    character.leftEyebrowY = smoothedValues.leftBrowY;
    character.rightEyebrowY = smoothedValues.rightBrowY;
    character.leftEyebrowAngle = smoothedValues.leftBrowAngle;
    character.rightEyebrowAngle = smoothedValues.rightBrowAngle;

    // Apply EXAGGERATED expression-specific visual modifications
    applyExaggeratedExpression(expression);

    // === MOUTH TRACKING ===
    const upperLip = keypoints[13];
    const lowerLip = keypoints[14];
    const mouthDistance = dist(upperLip.x, upperLip.y, lowerLip.x, lowerLip.y);
    mouthOpen = constrain(map(mouthDistance, 5, 30, 0, 1), 0, 1);

    // === EYE TRACKING ===
    const leftEyeTop = keypoints[159];
    const leftEyeBottom = keypoints[145];
    const rightEyeTop = keypoints[386];
    const rightEyeBottom = keypoints[374];

    const leftEyeDistance = dist(leftEyeTop.x, leftEyeTop.y, leftEyeBottom.x, leftEyeBottom.y);
    const rightEyeDistance = dist(rightEyeTop.x, rightEyeTop.y, rightEyeBottom.x, rightEyeBottom.y);

    leftEyeOpen = constrain(map(leftEyeDistance, 3, 15, 0, 1), 0, 1);
    rightEyeOpen = constrain(map(rightEyeDistance, 3, 15, 0, 1), 0, 1);

    // Don't use expression detection - we're doing real-time tracking now!
    // detectExpression();
}

// ========================================
// DETECT EXPRESSION
// ========================================

function detectExpression() {
    let newExpression = "neutral";

    if (mouthOpen > 0.6 && leftEyeOpen > 0.7 && rightEyeOpen > 0.7) {
        newExpression = "surprised";
    }
    else if (mouthOpen > 0.4 && leftEyeOpen < 0.5 && rightEyeOpen < 0.5) {
        newExpression = "happy";
    }
    else if (mouthOpen < 0.2 && (leftEyeOpen > 0.8 || rightEyeOpen > 0.8)) {
        newExpression = "angry";
    }
    else if (mouthOpen > 0.3 && mouthOpen < 0.5) {
        newExpression = "sad";
    }

    if (newExpression !== currentExpression) {
        console.log('Expression changed to:', newExpression);
        currentExpression = newExpression;
        animateCharacter(newExpression);
    }
}

// ========================================
// ANIMATE CHARACTER
// ========================================

function animateCharacter(expression) {
    console.log('Animating character to:', expression);

    let targets = {};

    if (expression === "happy") {
        targets = {
            leftEyebrowY: -10,
            rightEyebrowY: -10,
            leftEyebrowAngle: -5,
            rightEyebrowAngle: 5,
            eyeSize: 0.8,
            mouthY: 10,
            mouthHeight: 40,
            mouthCurve: 30
        };
    }
    else if (expression === "sad") {
        targets = {
            leftEyebrowY: -20,
            rightEyebrowY: -20,
            leftEyebrowAngle: 10,
            rightEyebrowAngle: -10,
            eyeSize: 1.2,
            mouthY: 20,
            mouthHeight: 20,
            mouthCurve: -20
        };
    }
    else if (expression === "angry") {
        targets = {
            leftEyebrowY: 0,
            rightEyebrowY: 0,
            leftEyebrowAngle: 15,
            rightEyebrowAngle: -15,
            eyeSize: 1.1,
            mouthY: 15,
            mouthHeight: 10,
            mouthCurve: 0
        };
    }
    else if (expression === "surprised") {
        targets = {
            leftEyebrowY: -30,
            rightEyebrowY: -30,
            leftEyebrowAngle: 0,
            rightEyebrowAngle: 0,
            eyeSize: 1.5,
            mouthY: 20,
            mouthHeight: 50,
            mouthCurve: 0
        };
    }
    else {
        targets = {
            leftEyebrowY: 0,
            rightEyebrowY: 0,
            leftEyebrowAngle: 0,
            rightEyebrowAngle: 0,
            eyeSize: 1,
            mouthY: 0,
            mouthHeight: 10,
            mouthCurve: 5
        };
    }

    anime({
        targets: character,
        leftEyebrowY: targets.leftEyebrowY,
        rightEyebrowY: targets.rightEyebrowY,
        leftEyebrowAngle: targets.leftEyebrowAngle,
        rightEyebrowAngle: targets.rightEyebrowAngle,
        eyeSize: targets.eyeSize,
        mouthY: targets.mouthY,
        mouthHeight: targets.mouthHeight,
        mouthCurve: targets.mouthCurve,
        duration: 600,
        easing: 'easeOutElastic(1, .6)'
    });
}

// ========================================
// APPLY EXAGGERATED EXPRESSION VISUALS
// ========================================

function applyExaggeratedExpression(expression) {
    // 2X AMPLIFY angles and positions for UNMISTAKABLE differences
    switch(expression) {
        case 'ANGRY':
            // ANGRY: Eyebrows angle DOWN sharply at -25°, thicker, darker
            character.leftEyebrowAngle *= 2.0; // Amplify by 2x
            character.rightEyebrowAngle *= 2.0;
            // Add extra downward angle if not enough
            if (character.leftEyebrowAngle > -20) character.leftEyebrowAngle = -25;
            if (character.rightEyebrowAngle < 20) character.rightEyebrowAngle = 25;
            // Make eyebrows THICKER and DARKER
            character.eyebrowThickness = 20;
            character.eyebrowColor = 0; // Black
            character.eyebrowCurvature = 0;
            break;

        case 'SAD':
            // SAD: Inner corners raise +8px, curved downward, lighter
            const innerRaiseAmount = 8;
            // Amplify the inverted-V shape
            character.leftEyebrowAngle *= 1.5;
            character.rightEyebrowAngle *= 1.5;
            // Make sure inner parts are clearly higher
            character.leftEyebrowY -= innerRaiseAmount;
            character.rightEyebrowY -= innerRaiseAmount;
            // Add curvature (sad eyebrows have a curve)
            character.eyebrowThickness = 14;
            character.eyebrowColor = 40; // Slightly lighter
            character.eyebrowCurvature = 5; // Curved shape
            break;

        case 'SURPRISED':
            // SURPRISED: Eyebrows jump +20px above neutral, thinner
            const raiseAmount = 20;
            character.leftEyebrowY -= raiseAmount;
            character.rightEyebrowY -= raiseAmount;
            // Make eyebrows thinner and more arched
            character.eyebrowThickness = 12;
            character.eyebrowColor = 20;
            character.eyebrowCurvature = -3; // Slightly arched up
            break;

        case 'NEUTRAL':
            // NEUTRAL: Default proportions
            character.eyebrowThickness = 16;
            character.eyebrowColor = 0;
            character.eyebrowCurvature = 0;
            break;

        default:
            // TRANSITIONING or CALIBRATING - keep defaults
            character.eyebrowThickness = 16;
            character.eyebrowColor = 0;
            character.eyebrowCurvature = 0;
    }
}

// ========================================
// DRAW BACKGROUND
// ========================================

function drawBackground() {
    let bgColor;

    if (currentExpression === "happy") {
        bgColor = color(255, 200, 100);
    }
    else if (currentExpression === "sad") {
        bgColor = color(100, 120, 180);
    }
    else if (currentExpression === "angry") {
        bgColor = color(255, 100, 100);
    }
    else if (currentExpression === "surprised") {
        bgColor = color(255, 150, 200);
    }
    else {
        bgColor = color(255, 74, 74);
    }

    background(bgColor);
}

// ========================================
// DRAW CHARACTER
// ========================================

function drawCharacter() {
    push();
    translate(width / 2, height / 2);

    // NO FACE CIRCLE - just features on background

    // Left eyebrow (with perfectly rounded endpoints)
    push();
    translate(-60, -100 + character.leftEyebrowY);
    rotate(radians(character.leftEyebrowAngle));
    fill(character.eyebrowColor); // Expression-specific color
    noStroke();

    // Draw eyebrow body with rounded capsule shape
    beginShape();
    // Top arc (curved body)
    for (let i = 0; i <= 20; i++) {
        let x = map(i, 0, 20, -35, 35);
        let t = i / 20;
        // Add slight natural curve to all eyebrows
        let baseCurve = -3 * sin(t * PI); // Natural arch
        let expressionCurve = character.eyebrowCurvature * sin(t * PI);
        let y = baseCurve + expressionCurve - character.eyebrowThickness/2;
        vertex(x, y);
    }
    // Bottom arc (curved body)
    for (let i = 20; i >= 0; i--) {
        let x = map(i, 0, 20, -35, 35);
        let t = i / 20;
        let baseCurve = -3 * sin(t * PI);
        let expressionCurve = character.eyebrowCurvature * sin(t * PI);
        let y = baseCurve + expressionCurve + character.eyebrowThickness/2;
        vertex(x, y);
    }
    endShape(CLOSE);

    // Draw rounded caps at both ends (left eyebrow)
    let leftBrowLeftEndY = -3 + character.eyebrowCurvature * sin(0);
    let leftBrowRightEndY = -3 + character.eyebrowCurvature * sin(PI);
    circle(-35, leftBrowLeftEndY, character.eyebrowThickness);
    circle(35, leftBrowRightEndY, character.eyebrowThickness);

    pop();

    // Right eyebrow (with perfectly rounded endpoints)
    push();
    translate(60, -100 + character.rightEyebrowY);
    rotate(radians(character.rightEyebrowAngle));
    fill(character.eyebrowColor);
    noStroke();

    // Draw eyebrow body with rounded capsule shape
    beginShape();
    // Top arc (curved body)
    for (let i = 0; i <= 20; i++) {
        let x = map(i, 0, 20, -35, 35);
        let t = i / 20;
        // Add slight natural curve to all eyebrows
        let baseCurve = -3 * sin(t * PI); // Natural arch
        let expressionCurve = character.eyebrowCurvature * sin(t * PI);
        let y = baseCurve + expressionCurve - character.eyebrowThickness/2;
        vertex(x, y);
    }
    // Bottom arc (curved body)
    for (let i = 20; i >= 0; i--) {
        let x = map(i, 0, 20, -35, 35);
        let t = i / 20;
        let baseCurve = -3 * sin(t * PI);
        let expressionCurve = character.eyebrowCurvature * sin(t * PI);
        let y = baseCurve + expressionCurve + character.eyebrowThickness/2;
        vertex(x, y);
    }
    endShape(CLOSE);

    // Draw rounded caps at both ends (right eyebrow)
    let rightBrowLeftEndY = -3 + character.eyebrowCurvature * sin(0);
    let rightBrowRightEndY = -3 + character.eyebrowCurvature * sin(PI);
    circle(-35, rightBrowLeftEndY, character.eyebrowThickness);
    circle(35, rightBrowRightEndY, character.eyebrowThickness);

    pop();

    // Eyes (placed side by side with no space)
    // Eye width is 90px, so position them at -45 and +45 to touch edges
    drawEye(-48, -40);
    drawEye(48, -40);

    // Mouth (adjusted position - moved down to prevent overlap)
    drawMouth();

    pop();
}

function drawEye(x, y) {
    push();
    translate(x, y);

    // Eye white (bigger)
    fill(255);
    noStroke();
    let eyeWidth = 90 * character.eyeSize;
    let eyeHeight = 90 * character.eyeSize;
    ellipse(0, 0, eyeWidth, eyeHeight);

    // Pupil (bigger and centered)
    fill(0);
    let pupilSize = 20 * character.eyeSize;
    ellipse(character.pupilOffsetX, character.pupilOffsetY, pupilSize);

    pop();
}

function drawMouth() {
    push();
    translate(0, 20 + character.mouthY);

    // Mouth color (darker red/brown)
    fill(210, 45, 45);
    noStroke();

    beginShape();
    // Top edge of mouth
    vertex(-50, 0);
    bezierVertex(-20, character.mouthCurve, 20, character.mouthCurve, 50, 0);

    // If mouth is open, draw bottom part
    if (character.mouthHeight > 5) {
        vertex(50, character.mouthHeight);
        bezierVertex(
            20, character.mouthHeight + character.mouthCurve/2,
            -20, character.mouthHeight + character.mouthCurve/2,
            -50, character.mouthHeight
        );
    }

    endShape(CLOSE);

    pop();
}

// ========================================
// TEST FUNCTION
// ========================================

function testExpression(expr) {
    console.log('Testing expression:', expr);
    currentExpression = expr;
    animateCharacter(expr);
}

