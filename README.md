# 🎧 SoundWalker – Audio-Based Game for the Visually Impaired

A unique and inclusive audio-only game created using **Vite + React + Tailwind CSS**, designed especially for the visually impaired. Players navigate traffic lanes using stereo sound cues and make decisions with a simple tap or key press.

---

## 🧠 Problem & Our Solution

**Problem**: Visually impaired users often lack access to meaningful gaming experiences because games are heavily visual and complex in controls.

**Solution**: We designed a simple, sound-based game that uses stereo audio to indicate the direction of approaching cars. Players use their hearing and quick decision-making to switch lanes using just one input (a tap or key), making the experience accessible and enjoyable.

---

## ✨ Features

- 🎵 **Audio-Guided Gameplay** – Uses stereo channels for directional sound cues.
- 👆 **One-Tap or Any-Key Control** – Easy for mobile and keyboard users.
- 📱 **Fully Mobile-Compatible** – Works on phones with just a tap.
- 🔄 **Replay Support** – Play again instantly after collision.
- 🧠 **No Visuals Needed** – Built specifically for non-visual interaction.
- 🧏 **Enhanced Accessibility** – Inclusive design using hearing strengths.

---

## 🔧 Tech Stack

- **Frontend Framework**: Vite + React
- **Styling**: Tailwind CSS
- **Audio**: HTML5 `<audio>` + stereo effects
- **Deployment Ready**: Works with Vercel / Netlify

---

## 📁 Folder Structure

src/
├── assets/ # Sound files (car, music)
├── components/ # Game visuals (basic), sound manager
├── hooks/ # Custom logic like useGameLogic
├── App.jsx # Main app logic
├── main.jsx # Entry point
├── index.css # Tailwind styles

yaml
Copy
Edit

---

## 🚀 Getting Started

### 📥 1. Clone the Repository

```bash
git clone https://github.com/your-username/soundwalker-game.git
cd soundwalker-game
Replace the URL with your actual GitHub repo URL.

📦 2. Install Dependencies
bash
Copy
Edit
npm install
🧪 3. Run in Development Mode
bash
Copy
Edit
npm run dev
Visit http://localhost:5173 in your browser or mobile device.

🎮 How to Play
You’ll hear vehicle sounds from either left or right.

Tap anywhere (mobile) or press any key (desktop) to switch lanes.

Avoid the approaching car by being in the opposite lane.

Game resets automatically on collision.
