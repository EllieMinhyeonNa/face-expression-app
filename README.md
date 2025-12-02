# Face Expression Interactive Character

A real-time facial expression recognition app that animates a character based on your webcam expressions.

## Features

- **Real-time face detection** using ml5.js FaceMesh
- **Expression recognition** - detects happy, sad, angry, surprised, and neutral
- **Smooth animations** with anime.js elastic easing
- **Dynamic backgrounds** that change color based on expression
- **Minimalist character design** with expressive eyebrows, eyes, and mouth

## Tech Stack

- **p5.js** - Canvas rendering and animation framework
- **ml5.js** - Machine learning face detection (FaceMesh model)
- **anime.js** - Smooth character animations with elastic easing

## How to Use

1. Open `index.html` in a web browser (Chrome recommended)
2. Allow webcam access when prompted
3. Wait for the model to load (~5 seconds)
4. Make facial expressions and watch the character react!

### Expression Detection

- **Happy** - Smile with eyes squinting
- **Sad** - Frown with raised eyebrows
- **Angry** - Closed mouth with wide eyes and angled eyebrows
- **Surprised** - Mouth wide open with raised eyebrows and big eyes
- **Neutral** - Relaxed face

## Manual Testing

Open the browser console and type:
```javascript
testExpression('happy')    // Test happy animation
testExpression('sad')      // Test sad animation
testExpression('angry')    // Test angry animation
testExpression('surprised')// Test surprised animation
```

## Project Structure

```
face-expression-app/
├── index.html          # Main HTML file with library imports
├── sketch.js           # p5.js sketch with face detection and character logic
└── README.md          # This file
```

## Background Colors

- **Happy** - Warm yellow (#FFC864)
- **Sad** - Cool blue (#6478B4)
- **Angry** - Red (#FF6464)
- **Surprised** - Pink (#FF96C8)
- **Neutral** - Light pink/red (#FF7878)

## Character Design

Minimalist style with:
- Thick black eyebrows (70px × 16px, with rotation)
- Large white eyes (90px diameter) with black pupils (35px)
- Simple mouth (100px wide) that curves for smiles/frowns

All features animate smoothly with anime.js elastic easing for a bouncy, organic feel.

## Requirements

- Modern web browser with WebGL support
- Webcam access
- Internet connection (for CDN libraries)

## Credits

Built for CTC-2012-01 Generative Systems class project.

Libraries:
- [p5.js](https://p5js.org/)
- [ml5.js](https://ml5js.org/)
- [anime.js](https://animejs.com/)
