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
    mouthCurve: 0
};

let currentExpression = "neutral";
let mouthOpen = 0;
let leftEyeOpen = 1;
let rightEyeOpen = 1;

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

    // Debug info
    fill(255);
    textAlign(LEFT);
    textSize(16);
    text("Expression: " + currentExpression, 10, 30);

    if (faces.length > 0) {
        text("Face detected!", 10, 55);
    } else {
        text("No face detected", 10, 55);
    }
}

// ========================================
// ANALYZE FACE EXPRESSION
// ========================================

function analyzeFaceExpression(face) {
    const keypoints = face.keypoints;

    // Get mouth keypoints
    const upperLip = keypoints[13];
    const lowerLip = keypoints[14];

    // Get eye keypoints
    const leftEyeTop = keypoints[159];
    const leftEyeBottom = keypoints[145];
    const rightEyeTop = keypoints[386];
    const rightEyeBottom = keypoints[374];

    // Calculate distances
    const mouthDistance = dist(upperLip.x, upperLip.y, lowerLip.x, lowerLip.y);
    mouthOpen = constrain(map(mouthDistance, 5, 30, 0, 1), 0, 1);

    const leftEyeDistance = dist(leftEyeTop.x, leftEyeTop.y, leftEyeBottom.x, leftEyeBottom.y);
    const rightEyeDistance = dist(rightEyeTop.x, rightEyeTop.y, rightEyeBottom.x, rightEyeBottom.y);

    leftEyeOpen = constrain(map(leftEyeDistance, 3, 15, 0, 1), 0, 1);
    rightEyeOpen = constrain(map(rightEyeDistance, 3, 15, 0, 1), 0, 1);

    detectExpression();
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
        bgColor = color(255, 120, 120);
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

    // Left eyebrow (thicker and more prominent)
    push();
    translate(-60, -80 + character.leftEyebrowY);
    rotate(radians(character.leftEyebrowAngle));
    fill(0);
    noStroke();
    // Make eyebrows thicker
    rect(-35, -8, 70, 16, 8);
    pop();

    // Right eyebrow (thicker and more prominent)
    push();
    translate(60, -80 + character.rightEyebrowY);
    rotate(radians(character.rightEyebrowAngle));
    fill(0);
    noStroke();
    rect(-35, -8, 70, 16, 8);
    pop();

    // Eyes (bigger and more prominent)
    drawEye(-60, -20);
    drawEye(60, -20);

    // Mouth (adjusted position)
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
    let pupilSize = 35 * character.eyeSize;
    ellipse(character.pupilOffsetX, character.pupilOffsetY, pupilSize);

    pop();
}

function drawMouth() {
    push();
    translate(0, 100 + character.mouthY);

    // Mouth color (darker red/brown)
    fill(180, 70, 70);
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
