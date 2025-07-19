// App.js
import { useEffect, useState, useRef, useCallback } from "react";

// --- Custom Hook for Game Logic ---
function useGameLogic() {
  const [gameState, setGameState] = useState({
    status: "Running", // "Running", "Game Over"
    score: 0,
    playerLane: "left", // "left", "right"
    cars: [],
  });
  
  const audioContextRef = useRef(null);
  const carSoundBufferRef = useRef(null);
  const gameAreaRef = useRef(null);

  // Game loop and timing references
  const lastTimeRef = useRef(0);
  const timeToNextSpawnRef = useRef(2000 + Math.random() * 2000); // Initial spawn time
  const timeSinceLastSpawnRef = useRef(0);

  // --- Constants for easy tuning ---
  const PLAYER_Y_POSITION = 650;
  const CAR_START_Y = -100;
  const GAME_HEIGHT = 800;
  const COLLISION_START_Y = PLAYER_Y_POSITION - 50;
  const COLLISION_END_Y = PLAYER_Y_POSITION + 50;

  // --- Audio Setup ---
  // Function to load and decode the car sound
  const setupAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!carSoundBufferRef.current) {
      try {
        const response = await fetch('/car-whoosh.mp3'); // Fetches from the /public folder
        const arrayBuffer = await response.arrayBuffer();
        const decodedAudio = await audioContextRef.current.decodeAudioData(arrayBuffer);
        carSoundBufferRef.current = decodedAudio;
      } catch (error) {
        console.error("Error loading audio file:", error);
        // Fallback to speech if audio file fails
        speak("Audio file not found. Using voice alerts.");
      }
    }
  }, []);
  
  // Generic speech synthesis function
  const speak = (text, priority = "low") => {
    if (priority === "high") {
      window.speechSynthesis.cancel();
    }
    const utter = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utter);
  };

  // Function to play a sound with spatial audio (panning)
  const playSpatialSound = (lane) => {
    // If audio isn't ready, fall back to simple speech
    if (!audioContextRef.current || !carSoundBufferRef.current) {
      speak(`Car on the ${lane}`);
      return;
    }
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = carSoundBufferRef.current;
    
    const panner = audioContextRef.current.createStereoPanner();
    panner.pan.value = lane === "left" ? -1 : 1; // -1 is left, 1 is right
    
    source.connect(panner).connect(audioContextRef.current.destination);
    source.start();
  };

  // --- Game Actions ---
  const restartGame = useCallback(() => {
    speak("Game started!", "high");
    setGameState({
      status: "Running",
      score: 0,
      playerLane: "left",
      cars: [],
    });
    timeToNextSpawnRef.current = 2000 + Math.random() * 2000;
    timeSinceLastSpawnRef.current = 0;
    if (gameAreaRef.current) gameAreaRef.current.focus();
  }, []);

  // --- Game Loop Effect ---
  useEffect(() => {
    if (gameState.status !== "Running") return;

    let animationFrameId;

    const gameLoop = (timestamp) => {
      const deltaTime = timestamp - (lastTimeRef.current || timestamp);
      lastTimeRef.current = timestamp;

      setGameState(prev => {
        // --- 1. Car Spawning Logic ---
        timeSinceLastSpawnRef.current += deltaTime;
        let newCars = [...prev.cars];
        
        if (timeSinceLastSpawnRef.current > timeToNextSpawnRef.current) {
          timeSinceLastSpawnRef.current = 0;
          timeToNextSpawnRef.current = 1500 + Math.random() * 2500; // Next car in 1.5 - 4s
          const lane = Math.random() > 0.5 ? "left" : "right";
          
          playSpatialSound(lane);
          
          newCars.push({
            id: Date.now(),
            lane,
            position: CAR_START_Y,
            speed: 4 + Math.random() * 3,
            scored: false,
          });
        }

        // --- 2. Update Car Positions ---
        let updatedCars = newCars.map(car => ({
          ...car,
          position: car.position + car.speed,
        }));

        // --- 3. Scoring Logic ---
        let newScore = prev.score;
        updatedCars.forEach(car => {
          if (!car.scored && car.position > PLAYER_Y_POSITION) {
            car.scored = true;
            newScore++;
          }
        });
        
        // --- 4. Collision Detection ---
        const collision = updatedCars.some(car => 
          car.lane === prev.playerLane && 
          car.position > COLLISION_START_Y && 
          car.position < COLLISION_END_Y
        );

        if (collision) {
          speak(`Crash! Game over. Final score: ${newScore}. Press Enter to restart.`, "high");
          return { ...prev, status: "Game Over", cars: updatedCars, score: newScore };
        }
        
        // --- 5. Remove Off-screen Cars ---
        const visibleCars = updatedCars.filter(car => car.position < GAME_HEIGHT);
        
        return { ...prev, cars: visibleCars, score: newScore };
      });

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState.status]);

  // --- Player Controls Effect ---
  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === "Space" && gameState.status === "Running") {
        // Resume audio context if it was suspended by browser policy
        if (audioContextRef.current && audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume();
        }
        setGameState(prev => ({ ...prev, playerLane: prev.playerLane === "left" ? "right" : "left" }));
      }
      if (e.code === "Enter" && gameState.status === "Game Over") {
        restartGame();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [gameState.status, restartGame]);
  
  // --- Initial Setup ---
  useEffect(() => {
    setupAudio();
    speak("Game loaded. Press Space to switch lanes.");
    if (gameAreaRef.current) gameAreaRef.current.focus();
  }, [setupAudio]);

  return { gameState, gameAreaRef, restartGame };
}


// --- Main Component for Rendering ---
export default function App() {
  const { gameState, gameAreaRef, restartGame } = useGameLogic();
  const { status, score, playerLane, cars } = gameState;

  return (
    <div
      ref={gameAreaRef}
      tabIndex={0}
      className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white font-sans p-4 outline-none"
    >
      <h1 className="text-5xl font-bold mb-4">Sound Runner 🚗</h1>
      
      <div className="text-center mb-4">
        <p className="text-2xl">Score: <span className="font-mono text-yellow-300">{score}</span></p>
        <p className="text-gray-400">Press <kbd className="px-2 py-1 bg-gray-700 rounded">SPACE</kbd> to switch lanes</p>
      </div>

      <div className={`text-xl font-bold px-4 py-2 rounded-full mb-4 ${
        status === "Running" ? "bg-green-600 animate-pulse" : "bg-red-600"
      }`}>
        {status}
      </div>

      {/* Game Area */}
      <div className="relative w-[320px] h-[800px] bg-gray-800 rounded-lg border-4 border-gray-700 overflow-hidden">
        {/* Dashed Line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full bg-repeating-dash"></div>

        {/* Player */}
        <div
          className="absolute w-12 h-20 bg-blue-500 rounded-t-lg z-20 transition-all duration-200"
          style={{
            bottom: `${800 - 700}px`, // Player fixed position from bottom
            left: playerLane === 'left' ? '25%' : '75%',
            transform: 'translateX(-50%)',
          }}
        ></div>

        {/* Cars */}
        {cars.map(car => (
          <div
            key={car.id}
            className="absolute w-12 h-20 bg-red-600 rounded-lg z-10"
            style={{
              top: `${car.position}px`,
              left: car.lane === 'left' ? '25%' : '75%',
              transform: 'translateX(-50%)',
            }}
          ></div>
        ))}
      </div>
      
      {status === "Game Over" && (
        <button
          onClick={restartGame}
          className="mt-6 px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg text-xl font-bold"
        >
          Restart Game (Press ENTER)
        </button>
      )}

      {/* Add this CSS to your index.css or a style tag */}
      <style>{`
        .bg-repeating-dash {
          background-image: linear-gradient(to bottom, yellow 70%, rgba(255,255,255,0) 0%);
          background-position: left;
          background-size: 100% 40px;
          background-repeat: repeat-y;
        }
      `}</style>
    </div>
  );
}