import { useEffect, useState, useRef, useCallback } from "react";

// --- Custom Hook for Game Logic ---
function useGameLogic() {
  const [gameState, setGameState] = useState({
    status: "idle", // "idle", "running", "paused", "game over"
    score: 0,
    playerLane: "left", // "left", "right"
    cars: [],
  });

  const audioContextRef = useRef(null);
  const carSoundBufferRef = useRef(null);
  const gameAreaRef = useRef(null);
  const audioStartedRef = useRef(false);

  // Timing refs
  const timeToNextSpawnRef = useRef(0);
  const timeSinceLastSpawnRef = useRef(0);
  const lastTimestampRef = useRef(0);

  // Refs for triple-click pause
  const spaceClickCountRef = useRef(0);
  const lastSpaceClickTimeRef = useRef(0);

  // Constants
  const PLAYER_Y_POSITION = 650;
  const CAR_START_Y = -100;
  const GAME_HEIGHT = 800;
  const COLLISION_START_Y = PLAYER_Y_POSITION - 50;
  const COLLISION_END_Y = PLAYER_Y_POSITION + 50;
  const AUDIO_LEAD_DISTANCE = 120;
  const AUDIO_PEAK_POSITION = PLAYER_Y_POSITION - AUDIO_LEAD_DISTANCE;
  const AUDIO_FADE_IN_DISTANCE = 500; 

  // Audio Setup
  const setupAudio = useCallback(async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      
      const response = await fetch('/car.wav');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const arrayBuffer = await response.arrayBuffer();
      carSoundBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error("Audio setup error:", error);
    }
  }, []);

  // Speech Synthesis
  const speak = (text, priority = "low") => {
    if (window.speechSynthesis) {
      if (priority === "high") {
        window.speechSynthesis.cancel();
      }
      const utter = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utter);
    }
  };
  
  // Safe Audio Cleanup Function
  const cleanupCarAudio = (car) => {
      if (!car.audioNodes) return;
      try {
          car.audioNodes.source.stop();
          car.audioNodes.source.disconnect();
          car.audioNodes.gainNode.disconnect();
          car.audioNodes.panner.disconnect();
      } catch (e) { /* Ignore errors */ }
  };

  // Create Car Audio Source
  const createCarAudioSource = useCallback((lane) => {
    if (!audioContextRef.current || !carSoundBufferRef.current || audioContextRef.current.state === 'closed') return null;

    try {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = carSoundBufferRef.current;
      source.loop = true;

      const panner = audioContextRef.current.createStereoPanner();
      panner.pan.value = lane === "left" ? -1 : 1;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 0;

      source.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(audioContextRef.current.destination);
      
      source.start();
      
      return { source, gainNode, panner };
    } catch (error) {
      console.error("Error creating car audio source:", error);
      return null;
    }
  }, []);

  // Game Actions
  const startGame = useCallback(() => {
    speak("Game started!", "high");
    setGameState(prev => {
        prev.cars.forEach(cleanupCarAudio);
        return {
            status: "running",
            score: 0,
            playerLane: "left",
            cars: [],
        };
    });
    timeToNextSpawnRef.current = 2000 + Math.random() * 2000;
    timeSinceLastSpawnRef.current = 0;
    lastTimestampRef.current = performance.now();
    if (gameAreaRef.current) gameAreaRef.current.focus();
  }, []);

  // Pause/Resume Function
  const togglePause = useCallback(() => {
    setGameState(prev => {
      if (prev.status === "running") {
        prev.cars.forEach(car => {
          if (car.audioNodes) {
            car.audioNodes.gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
          }
        });
        speak("Game paused.");
        return { ...prev, status: "paused" };
      }
      if (prev.status === "paused") {
        lastTimestampRef.current = performance.now();
        speak("Resuming.");
        return { ...prev, status: "running" };
      }
      return prev;
    });
  }, []);

  // Game Loop Effect
  useEffect(() => {
    if (gameState.status !== "running") {
      return;
    }

    let animationFrameId;

    const gameLoop = (timestamp) => {
      const deltaTime = Math.min(timestamp - lastTimestampRef.current, 100);
      lastTimestampRef.current = timestamp;
      
      setGameState(prev => {
        if (prev.status !== 'running') return prev;

        timeSinceLastSpawnRef.current += deltaTime;
        let newCars = [...prev.cars];
        
        if (timeSinceLastSpawnRef.current > timeToNextSpawnRef.current) {
          timeSinceLastSpawnRef.current = 0;
          timeToNextSpawnRef.current = 1500 + Math.random() * 2500;
          const lane = Math.random() > 0.5 ? "left" : "right";
          
          newCars.push({
            id: Date.now() + Math.random(),
            lane,
            position: CAR_START_Y,
            speed: 4 + Math.random() * 3,
            scored: false,
            audioNodes: createCarAudioSource(lane),
          });
        }

        const updatedCars = newCars.map(car => {
          const newPosition = car.position + car.speed * (deltaTime / 16.67);
          
          if (car.audioNodes) {
            const distance = Math.abs(AUDIO_PEAK_POSITION - newPosition);
            const volume = Math.max(0, 1 - (distance / AUDIO_FADE_IN_DISTANCE));
            car.audioNodes.gainNode.gain.setValueAtTime(volume, audioContextRef.current.currentTime);
          }
          
          return { ...car, position: newPosition };
        });

        let newScore = prev.score;
        updatedCars.forEach(car => {
          if (!car.scored && car.position > PLAYER_Y_POSITION) {
            car.scored = true;
            newScore++;
          }
        });
        
        const collision = updatedCars.some(car => 
          car.lane === prev.playerLane && 
          car.position > COLLISION_START_Y && 
          car.position < COLLISION_END_Y
        );

        if (collision) {
          speak(`Crash! Game over. Final score: ${newScore}.`, "high");
          updatedCars.forEach(cleanupCarAudio);
          return { ...prev, status: "game over", cars: updatedCars, score: newScore };
        }
        
        const visibleCars = updatedCars.filter(car => car.position < GAME_HEIGHT);
        const removedCars = updatedCars.filter(car => car.position >= GAME_HEIGHT);
        removedCars.forEach(cleanupCarAudio);
        
        return { ...prev, cars: visibleCars, score: newScore };
      });

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
        cancelAnimationFrame(animationFrameId);
    }
  }, [gameState.status, createCarAudioSource]);
    
  // Player Controls Effect
  useEffect(() => {
    const handleKey = (e) => {
      if (!audioStartedRef.current && audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          audioStartedRef.current = true;
        });
      }

      if (e.code === "Enter" && (gameState.status === "idle" || gameState.status === "game over")) {
        startGame();
      }
      
      // This condition now allows space bar to be detected while running OR paused
      if (e.code === "Space" && (gameState.status === "running" || gameState.status === "paused")) {
        // --- Check for triple-press to pause/resume ---
        const now = performance.now();
        const timeSinceLastClick = now - lastSpaceClickTimeRef.current;
        const PAUSE_CLICK_TIMEOUT = 500; // 500ms window for triple click

        if (timeSinceLastClick > PAUSE_CLICK_TIMEOUT) {
            spaceClickCountRef.current = 1;
        } else {
            spaceClickCountRef.current += 1;
        }
        
        lastSpaceClickTimeRef.current = now;

        if (spaceClickCountRef.current === 3) {
            togglePause();
            spaceClickCountRef.current = 0; // Reset counter after action
        }

        // --- Only switch lanes if the game is actually running ---
        if (gameState.status === "running") {
            setGameState(prev => ({ 
                ...prev, 
                playerLane: prev.playerLane === "left" ? "right" : "left" 
            }));
        }
      }

      // 'P' key still works as a backup
      if (e.code === "KeyP" && (gameState.status === "running" || gameState.status === "paused")) {
          togglePause();
      }
    };
    
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [gameState.status, startGame, togglePause]);

  // Initial Setup Effect
  useEffect(() => {
    setupAudio();
    speak("Game loaded. Press Enter to start. Press Space to switch lanes. Triple-press space to pause or resume.");
    return () => {
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
    }
  }, [setupAudio]);

  return { gameState, gameAreaRef, startGame, togglePause };
}


// --- Main Component for Rendering ---
export default function App() {
  const { gameState, gameAreaRef, startGame, togglePause } = useGameLogic();
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
        <p className="text-gray-400">
            <kbd className="px-2 py-1 bg-gray-700 rounded">SPACE</kbd> to switch | <kbd className="px-2 py-1 bg-gray-700 rounded">P</kbd> to pause
        </p>
        <p className="text-gray-500 text-sm mt-1">(Or triple-press SPACE to pause/resume)</p>
      </div>

      <div className={`text-xl font-bold px-4 py-2 rounded-full mb-4 ${
        status === "running" ? "bg-green-600 animate-pulse" : 
        status === "paused" ? "bg-yellow-600" :
        status === "game over" ? "bg-red-600" : "bg-blue-600"
      }`}>
        {status.toUpperCase()}
      </div>

      <div className="relative w-[320px] h-[800px] bg-gray-800 rounded-lg border-4 border-gray-700 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full bg-repeating-dash"></div>
        
        <img
          src="/player-car.png"
          alt="Player Car"
          className="absolute w-40 h-55 object-contain z-20 transition-all duration-200"
          style={{
            bottom: '100px',
            left: playerLane === 'left' ? '25%' : '75%',
            transform: 'translateX(-50%)',
          }}
        />

        {cars.map(car => (
          <img
            key={car.id}
            src="/enemy-car.png"
            alt="Enemy Car"
            className="absolute w-40 h-55 object-contain z-10"
            style={{
              top: `${car.position}px`,
              left: car.lane === 'left' ? '25%' : '75%',
              transform: 'translateX(-50%)',
            }}
          />
        ))}
      </div>
      
      <div className="mt-6">
        {(status === "idle" || status === "game over") && (
          <button
            onClick={startGame}
            className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg text-xl font-bold"
          >
            {status === 'idle' ? 'Start Game' : 'Restart Game'} (ENTER)
          </button>
        )}

        {(status === "running" || status === "paused") && (
            <button
                onClick={togglePause}
                className="px-6 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-xl font-bold"
            >
                {status === 'running' ? 'Pause' : 'Resume'} (P)
            </button>
        )}
      </div>

      <div className="mt-8 text-gray-400 text-sm text-center">
        <p>Wear headphones for the best experience.</p>
        <p>Cars get louder as they approach.</p>
      </div>

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