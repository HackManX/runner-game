import { useEffect, useState, useRef, useCallback } from "react";

// --- Custom Hook for Game Logic ---
function useGameLogic() {
  const [gameState, setGameState] = useState({
    status: "idle",
    score: 0,
    playerLane: "left",
    cars: [],
  });

  const [announcementDone, setAnnouncementDone] = useState(false);

  const audioContextRef = useRef(null);
  const carSoundBufferRef = useRef(null);
  const gameAreaRef = useRef(null);
  const audioStartedRef = useRef(false);
  const timeToNextSpawnRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const lastCarSoundTimeRef = useRef(0); // <-- ADD THIS LINE
  const lastAnnouncedScoreRef = useRef(0);
  const scoreAnnouncingRef = useRef(false);

  // Refs for triple-click pause
  const spaceClickCountRef = useRef(0);
  const lastSpaceClickTimeRef = useRef(0);

  // Touch controls refs
  const lastTouchTimeRef = useRef(0);
  const touchStartXRef = useRef(0);

  // Audio Setup
  const setupAudio = useCallback(async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();

      const response = await fetch("/car.wav");
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      carSoundBufferRef.current = await audioContextRef.current.decodeAudioData(
        arrayBuffer
      );
    } catch (error) {
      console.error("Audio setup error:", error);
    }
  }, []);

  // Speech Synthesis
  const speak = (text, priority = "low", onend) => {
    if (window.speechSynthesis) {
      if (priority === "high") {
        window.speechSynthesis.cancel();
      }
      const utter = new SpeechSynthesisUtterance(text);
      if (onend) utter.onend = onend;
      window.speechSynthesis.speak(utter);
    }
  };

  // Game Actions
  const startGame = useCallback(() => {
    setGameState(() => ({
      status: "running",
      score: 0,
      playerLane: "left",
      cars: [],
    }));
    timeToNextSpawnRef.current = 800 + Math.random() * 800;
    lastTimestampRef.current = performance.now();
    if (gameAreaRef.current) gameAreaRef.current.focus();
  }, []);

  // Toggle Pause
  const togglePause = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      status: prev.status === "paused" ? "running" : "paused",
    }));
  }, []);

  // Change Lane
  const changeLane = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      playerLane: prev.playerLane === "left" ? "right" : "left",
    }));
  }, []);

  // --- Stereo Car Sound ---
  function playCarSound(volume = 1, lane = "left") {
    if (!audioContextRef.current || !carSoundBufferRef.current) return;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = carSoundBufferRef.current;
    const gainNode = audioContextRef.current.createGain();
    // Clamp volume between 0.1 and 0.5 for comfort
    gainNode.gain.value = Math.max(0.1, Math.min(0.5, volume));

    const panner = audioContextRef.current.createStereoPanner
      ? audioContextRef.current.createStereoPanner()
      : null;
    if (panner) {
      panner.pan.value = lane === "left" ? -1 : 1;
      source
        .connect(gainNode)
        .connect(panner)
        .connect(audioContextRef.current.destination);
    } else {
      source.connect(gainNode).connect(audioContextRef.current.destination);
    }
    source.start();
  }

  const currentCarSoundRef = useRef(null);
  const currentCarIdRef = useRef(null);
  const currentGainNodeRef = useRef(null);
  const currentPannerNodeRef = useRef(null);

  // Player Controls Effect
  useEffect(() => {
    const handleKey = (e) => {
      if (
        !audioStartedRef.current &&
        audioContextRef.current?.state === "suspended"
      ) {
        audioContextRef.current.resume().then(() => {
          audioStartedRef.current = true;
        });
      }

      // Only allow SPACE to start game after announcement
      if (
        e.code === "Space" &&
        (gameState.status === "idle" || gameState.status === "game over") &&
        announcementDone
      ) {
        startGame();
        return;
      }

      // Prevent Enter/Backspace from starting game
      if (
        (e.code === "Enter" || e.code === "Backspace") &&
        (gameState.status === "idle" || gameState.status === "game over")
      ) {
        return;
      }

      // ...existing controls for running/paused...
      if (
        e.code === "Space" &&
        (gameState.status === "running" || gameState.status === "paused")
      ) {
        const now = performance.now();
        const timeSinceLastClick = now - lastSpaceClickTimeRef.current;
        const PAUSE_CLICK_TIMEOUT = 500;

        if (timeSinceLastClick > PAUSE_CLICK_TIMEOUT) {
          spaceClickCountRef.current = 1;
        } else {
          spaceClickCountRef.current += 1;
        }

        lastSpaceClickTimeRef.current = now;

        if (spaceClickCountRef.current === 3) {
          togglePause();
          spaceClickCountRef.current = 0;
        }

        if (gameState.status === "running") {
          changeLane();
        }
      }

      if (
        e.code === "KeyP" &&
        (gameState.status === "running" || gameState.status === "paused")
      ) {
        togglePause();
      }
    };

    // Touch controls for mobile
    const handleTouchStart = (e) => {
      const now = Date.now();
      const isDoubleTap = now - lastTouchTimeRef.current < 300;
      touchStartXRef.current = e.touches[0].clientX;

      if (isDoubleTap) {
        togglePause();
        return;
      }

      lastTouchTimeRef.current = now;
    };

    const handleTouchEnd = (e) => {
      if (gameState.status !== "running") return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchDiff = touchEndX - touchStartXRef.current;

      // If significant horizontal movement, change lane
      if (Math.abs(touchDiff) > 10) {
        changeLane();
      } else {
        // Simple tap - change lane based on tap position
        const screenWidth = window.innerWidth;
        const tapX = e.changedTouches[0].clientX;

        if (tapX < screenWidth / 2) {
          if (gameState.playerLane !== "left") changeLane();
        } else {
          if (gameState.playerLane !== "right") changeLane();
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [gameState.status, startGame, togglePause, changeLane, announcementDone]);

  // Initial Setup Effect: Announce on load
  useEffect(() => {
    setupAudio();
    setAnnouncementDone(false);
    // Do NOT call speak() here!
    return () => {
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, [setupAudio]);

  // Game Loop Effect
  useEffect(() => {
    if (gameState.status !== "running") return;

    let animationId;

    const PLAYER_HIT_ZONE = 650;
    const SOUND_ZONE_START = 100;
    const SOUND_ZONE_END = PLAYER_HIT_ZONE;
    const CAR_SPEED = 3;

    const gameLoop = (timestamp) => {
      setGameState((prev) => {
        // If announcing score, freeze cars and don't spawn new ones or play car sound
        if (scoreAnnouncingRef.current) {
          return { ...prev };
        }

        const newCars = prev.cars
          .map((car) => ({
            ...car,
            position: car.position + CAR_SPEED,
          }))
          .filter((car) => car.position < 700);

        if (newCars.length === 0) {
          newCars.push({
            id: Math.random().toString(36).substr(2, 9),
            lane: Math.random() < 0.5 ? "left" : "right",
            position: -50,
          });
        }

        // --- Only play sound for the closest car, throttled ---
        const carForSound = newCars
          .filter((car) => car.position < PLAYER_HIT_ZONE + 100) // allow fade after passing
          .sort((a, b) => b.position - a.position)[0];

        if (carForSound) {
          // If a new car is approaching, start its sound
          if (currentCarIdRef.current !== carForSound.id) {
            // Stop previous sound
            if (currentCarSoundRef.current) {
              currentCarSoundRef.current.stop();
              currentCarSoundRef.current.disconnect();
              currentCarSoundRef.current = null;
            }
            // Start new sound
            if (
              carForSound.position > SOUND_ZONE_START &&
              carForSound.position < PLAYER_HIT_ZONE + 100
            ) {
              const source = audioContextRef.current.createBufferSource();
              source.buffer = carSoundBufferRef.current;
              source.loop = true;
              const gainNode = audioContextRef.current.createGain();
              const panner = audioContextRef.current.createStereoPanner
                ? audioContextRef.current.createStereoPanner()
                : null;
              if (panner) {
                gainNode
                  .connect(panner)
                  .connect(audioContextRef.current.destination);
              } else {
                gainNode.connect(audioContextRef.current.destination);
              }
              source.connect(gainNode);
              source.start();
              currentCarSoundRef.current = source;
              currentCarIdRef.current = carForSound.id;
              currentGainNodeRef.current = gainNode;
              currentPannerNodeRef.current = panner;
            }
          }
          // Adjust volume and pan as car moves
          if (currentGainNodeRef.current) {
            const gain = Math.max(
              0.1,
              Math.min(
                0.7,
                1 -
                  (SOUND_ZONE_END - carForSound.position) /
                    (SOUND_ZONE_END - SOUND_ZONE_START)
              )
            );
            currentGainNodeRef.current.gain.value = gain;
          }
          if (currentPannerNodeRef.current) {
            currentPannerNodeRef.current.pan.value =
              carForSound.lane === "left" ? -1 : 1;
          }
          // Stop sound if car has passed far enough
          if (carForSound.position > PLAYER_HIT_ZONE + 80) {
            if (currentCarSoundRef.current) {
              currentCarSoundRef.current.stop();
              currentCarSoundRef.current.disconnect();
              currentCarSoundRef.current = null;
              currentCarIdRef.current = null;
              currentGainNodeRef.current = null;
              currentPannerNodeRef.current = null;
            }
          }
        } else {
          // No car in sound zone, stop any sound
          if (currentCarSoundRef.current) {
            currentCarSoundRef.current.stop();
            currentCarSoundRef.current.disconnect();
            currentCarSoundRef.current = null;
            currentCarIdRef.current = null;
            currentGainNodeRef.current = null;
            currentPannerNodeRef.current = null;
          }
        }

        const playerLane = prev.playerLane;
        const collision = prev.cars.some(
          (car) =>
            car.lane === playerLane &&
            car.position < PLAYER_HIT_ZONE &&
            car.position + CAR_SPEED >= PLAYER_HIT_ZONE
        );

        if (collision) {
          return {
            ...prev,
            status: "game over",
          };
        }

        const passedCars = prev.cars.filter(
          (car) =>
            car.position < PLAYER_HIT_ZONE &&
            car.position + CAR_SPEED >= PLAYER_HIT_ZONE
        ).length;

        const newScore = prev.score + passedCars;

        // --- Announce score every 5 points, pause game while speaking ---
        if (
          newScore > 0 &&
          newScore % 5 === 0 &&
          newScore !== lastAnnouncedScoreRef.current
        ) {
          scoreAnnouncingRef.current = true;
          speak(`Score: ${newScore}`, "high", () => {
            scoreAnnouncingRef.current = false;
          });
          lastAnnouncedScoreRef.current = newScore;
        }

        return {
          ...prev,
          cars: newCars,
          score: newScore,
        };
      });

      animationId = requestAnimationFrame(gameLoop);
    };

    animationId = requestAnimationFrame(gameLoop);

    return () => cancelAnimationFrame(animationId);
  }, [gameState.status]);

  // Announcement Effect
  useEffect(() => {
    if (announcementDone) return;

    let announced = false; // Prevent multiple triggers

    const announce = () => {
      if (announced) return;
      announced = true;
      setAnnouncementDone(false);
      window.speechSynthesis.cancel();
      const utter = new window.SpeechSynthesisUtterance(
        "Welcome to Sound Runner. Please  follow  the  instructions  carefully.  Press space bar to start the game. Use space bar to switch lanes. Triple press space to pause. Cars approaching from either  sides  will  make  sounds, you   can    hear   through   different  sides  of  headset. For each successful pass you score 1 point! Wear headphones for the best experience. At starting, car is at left side. Always keep in mind which track you are in. Press space bar and start the game."
      );
      utter.onend = () => setAnnouncementDone(true);
      window.speechSynthesis.speak(utter);
    };

    const handler = (e) => {
      // Only announce if not already done and not already started
      if (
        !announcementDone &&
        !announced &&
        (gameState.status === "idle" || gameState.status === "game over")
      ) {
        announce();
      }
    };

    window.addEventListener("keydown", handler, { once: true });
    window.addEventListener("mousedown", handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });

    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("touchstart", handler);
    };
  }, [announcementDone, gameState.status, setAnnouncementDone]);

  const lastStatusRef = useRef(gameState.status);

  useEffect(() => {
    if (
      lastStatusRef.current !== "game over" &&
      gameState.status === "game over"
    ) {
      speak("OH NO ! YOU CRASHED ! YOUR FINAL SCORE  IS  " + gameState.score + ".  Press  space  bar to restart.", "high");
    }
    lastStatusRef.current = gameState.status;
  }, [gameState.status, speak]);

  return {
    gameState,
    gameAreaRef,
    startGame,
    togglePause,
    changeLane,
    announcementDone,
    setAnnouncementDone,
    speak,
  };
}

// --- Main Component for Rendering ---
export default function App() {
  const {
    gameState,
    gameAreaRef,
    startGame,
    togglePause,
    announcementDone,
    setAnnouncementDone,
    speak,
  } = useGameLogic();
  const { status, score, playerLane, cars } = gameState;

  return (
    <div
      ref={gameAreaRef}
      tabIndex={0}
      className="flex flex-col items-center justify-center h-screen w-screen bg-gray-900 text-white font-sans outline-none overflow-hidden"
      style={{ padding: 5, margin: 0 }}
    >
      <h1 className="text-2xl md:text-4xl font-bold mb-2 mt-2">
        Audio Racer 🚗
      </h1>

      <div className="text-center mb-2">
        <p className="text-lg md:text-xl">
          Score: <span className="font-mono text-yellow-300">{score}</span>
        </p>
    
      </div>

      <div
        className={`text-lg md:text-xl font-bold px-4 py-1 rounded-full mb-2 ${
          status === "running"
            ? "bg-green-600 animate-pulse"
            : status === "paused"
            ? "bg-yellow-600"
            : status === "game over"
            ? "bg-red-600"
            : "bg-blue-600"
        }`}
      >
        {status.toUpperCase()}
      </div>

      {/* Make lanes longer and thinner */}
      <div className="relative flex-1 w-[60vw] max-w-[180px] min-w-[100px] h-[80vh] max-h-[700px] bg-gray-800 rounded-lg border-4 border-gray-700 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-full bg-repeating-dash"></div>

        <img
          src="/player-car.png"
          alt="Player Car"
          className="absolute w-10 md:w-16 h-16 md:h-24 object-contain z-20 transition-all duration-200"
          style={{
            bottom: "8px",
            left: playerLane === "left" ? "30%" : "70%",
            transform: "translateX(-50%)",
          }}
        />

        {cars.map((car) => (
          <img
            key={car.id}
            src="/enemy-car.png"
            alt="Enemy Car"
            className="absolute w-10 md:w-16 h-16 md:h-24 object-contain z-10"
            style={{
              top: `${car.position}px`,
              left: car.lane === "left" ? "30%" : "70%",
              transform: "translateX(-50%)",
            }}
          />
        ))}
      </div>

      <div className="mt-2">
        {(status === "idle" || status === "game over") && (
          <div className="px-4 py-2 md:px-6 md:py-3 bg-blue-600 rounded-lg text-lg md:text-xl font-bold">
            {announcementDone
              ? "Press SPACE to Start"
              : "Tap or press any key to hear instructions"}
          </div>
        )}

        {(status === "running" || status === "paused") && (
          <button
            onClick={togglePause}
            className="px-4 py-2 md:px-6 md:py-3 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-lg md:text-xl font-bold"
          >
            {status === "running" ? "Pause" : "Resume"} (Double Tap)
          </button>
        )}
      </div>

      <style>{`
        .bg-repeating-dash {
          background-image: linear-gradient(to bottom, yellow 70%, rgba(255,255,255,0) 0%);
          background-position: left;
          background-size: 100% 30px;
          background-repeat: repeat-y;
        }
      `}</style>
    </div>
  );
}
