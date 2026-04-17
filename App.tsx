/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  Layers,
  Menu,
  BarChart2,
  X
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { Block, GameState, Particle } from './types';

const CONSTANTS = {
  BLOCK_HEIGHT: 40,
  INITIAL_WIDTH: 200,
  MOVE_SPEED: 0.1,
  PERFECT_THRESHOLD: 8,
  MAX_PARTICLES: 50,
  LEVELS: [
    { name: 'BASIC FEED', desc: 'Average scrolling vibes. Let\'s lock in.', threshold: 1 },
    { name: 'VIRAL PHASE', desc: 'Ur stats are climbing. Algorithms are watching.', threshold: 2 },
    { name: 'MAIN CHARACTER', desc: 'POV: You actually have focus. High-key impressive.', threshold: 4 },
    { name: 'GLITCH ERA', desc: 'The Loop is trying to ratio you. Don\'t fold.', threshold: 6 },
    { name: 'PEAK PERFORMANCE', desc: 'Actual legend behavior. No thoughts, just flow.', threshold: 9 },
    { name: 'BEYOND THE GRID', desc: 'Touching grass... mentally. You\'re the GOAT.', threshold: 12 },
  ]
};

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [level, setLevel] = useState(1);
  const [transmission, setTransmission] = useState<string>('MAIN CHARACTER ENERGY DETECTED. . . PATIENCE');
  const [zenWisdom, setZenWisdom] = useState<string>('');
  const [isLoadingWisdom, setIsLoadingWisdom] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showProtocols, setShowProtocols] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  
  // Audio setup
  const audioCtx = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playSound = (type: 'drop' | 'perfect' | 'fail' | 'level' | 'spawn' | 'repair') => {
    if (!audioCtx.current) return;
    const ctx = audioCtx.current;
    if (ctx.state === 'suspended') ctx.resume();
    
    const now = ctx.currentTime;
    
    if (type === 'level') {
      [440, 554.37, 659.25, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, now + i * 0.1);
        gain.gain.setValueAtTime(0.05, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.3);
      });
      return;
    }

    if (type === 'repair') {
      [880, 1108.73, 1318.51].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(0.03, now + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.1);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.1);
      });
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch(type) {
      case 'spawn':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'drop':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'perfect':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'fail':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.5);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
    }
  };
  
  // Game state refs (for the loop)
  const stateRef = useRef({
    blocks: [] as Block[],
    currentBlock: null as Block | null,
    cameraY: 0,
    targetCameraY: 0,
    particles: [] as Particle[],
    lastTime: 0,
    screenShake: 0,
  });

  const generateWisdom = async (finalScore: number) => {
    setIsLoadingWisdom(true);
    const currentLevelName = CONSTANTS.LEVELS[Math.min(level - 1, CONSTANTS.LEVELS.length - 1)].name;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I reached an altitude of ${finalScore} in ${currentLevelName} of the Zenith protocol. Provide a relatable, witty Gen Z insight about focus and digital detox. Use terms like 'slay', 'bet', 'no cap', 'ratioed', 'POV', 'touch grass'.`,
        config: {
          systemInstruction: "You are a chronic online bestie who wants your friend to touch grass. Provide a single, short, witty sentence of wisdom. Tone: Sarcastic, supportive, Gen Z slang. No emojis. No hashtags.",
        }
      });
      setZenWisdom(response.text || "Neural cache cleared. Clarity restored.");
    } catch (error) {
      console.error("Wisdom delivery failed:", error);
      setZenWisdom("In the machine silence, the observer remains.");
    } finally {
      setIsLoadingWisdom(false);
    }
  };

  const initGame = useCallback(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    const baseBlock: Block = {
      id: 'base',
      x: width / 2 - CONSTANTS.INITIAL_WIDTH / 2,
      y: height - CONSTANTS.BLOCK_HEIGHT - 60,
      width: CONSTANTS.INITIAL_WIDTH,
      height: CONSTANTS.BLOCK_HEIGHT,
      color: '#2dd4bf', // Teal accent
      isStable: true,
      velocity: 0,
      direction: 1
    };

    stateRef.current.blocks = [baseBlock];
    stateRef.current.cameraY = 0;
    stateRef.current.targetCameraY = 0;
    stateRef.current.particles = [];
    stateRef.current.screenShake = 0;
    
    spawnBlock(baseBlock);
    setScore(0);
    setLevel(1);
    setCombo(0);
    setTransmission('VIBE_STABLE: ASCENDING_BEYOND_THE_FEED...');
    playSound('level');
  }, []);

  const spawnBlock = (lastBlock: Block) => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const nextY = lastBlock.y - CONSTANTS.BLOCK_HEIGHT;
    
    // Level-based difficulty scaling
    const levelSpeedBonus = (level - 1) * 0.015; // Reduced from 0.02
    const speed = 0.12 + (stateRef.current.blocks.length * 0.003) + levelSpeedBonus; // Reduced base and increment
    
    const spawnOnLeft = Math.random() < 0.5;
    stateRef.current.currentBlock = {
      id: Math.random().toString(36).substr(2, 9),
      x: spawnOnLeft ? -lastBlock.width : width,
      y: nextY,
      width: lastBlock.width,
      height: CONSTANTS.BLOCK_HEIGHT,
      color: '#2dd4bf',
      isStable: false,
      velocity: speed,
      direction: spawnOnLeft ? 1 : -1 // Ensure direction matches side for consistent entry
    };
    playSound('spawn');
  };

  const createParticles = (x: number, y: number, color: string, count: number = 10) => {
    for (let i = 0; i < count; i++) {
      stateRef.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        size: Math.random() * 3 + 1,
        color,
        life: 1,
        maxLife: Math.random() * 20 + 15
      });
    }
  };

  const handleAction = useCallback(() => {
    if (gameState !== 'PLAYING') return;
    
    const { currentBlock, blocks } = stateRef.current;
    if (!currentBlock) return;

    const lastBlock = blocks[blocks.length - 1];
    const diff = currentBlock.x - lastBlock.x;
    const absDiff = Math.abs(diff);

    if (absDiff >= lastBlock.width) {
      setGameState('GAMEOVER');
      stateRef.current.screenShake = 15;
      playSound('fail');
      generateWisdom(score);
      return;
    }

    // Apply a mercy factor to the reduction (0.8 = 20% reduction in punishment)
    let newWidth = lastBlock.width - (absDiff * 0.8);
    let newX = diff > 0 ? currentBlock.x : lastBlock.x;
    
    const isPerfect = absDiff < CONSTANTS.PERFECT_THRESHOLD;
    if (isPerfect) {
      newWidth = lastBlock.width;
      
      // COMBO BOOST: If combo >= 3, repair the block width
      const currentCombo = combo + 1;
      if (currentCombo >= 3 && newWidth < CONSTANTS.INITIAL_WIDTH) {
        newWidth = Math.min(CONSTANTS.INITIAL_WIDTH, newWidth + 12);
        playSound('repair');
        createParticles(lastBlock.x + lastBlock.width / 2, currentBlock.y, '#f4f4f5', 20); // White flash for repair
      }

      newX = lastBlock.x;
      setCombo(prev => prev + 1);
      createParticles(newX + newWidth / 2, currentBlock.y, '#2dd4bf', 15);
      playSound('perfect');
    } else {
      setCombo(0);
      createParticles(diff > 0 ? newX + newWidth : newX, currentBlock.y, '#3f3f46', 5);
      playSound('drop');
    }

    const stableBlock: Block = {
      ...currentBlock,
      x: newX,
      width: newWidth,
      isStable: true,
      color: isPerfect ? '#2dd4bf' : '#27272a'
    };

    stateRef.current.blocks.push(stableBlock);
    
    const newScore = score + 1;
    setScore(newScore);
    
    // Check for level up
    const nextLevel = Math.floor(newScore / 10) + 1;
    if (nextLevel > level) {
      setLevel(nextLevel);
      const levelMeta = CONSTANTS.LEVELS[Math.min(nextLevel - 1, CONSTANTS.LEVELS.length - 1)];
      setTransmission(`LEVEL_UP: ${levelMeta.name}. ${levelMeta.desc}`);
      playSound('level');
      stateRef.current.screenShake = 5;
    }

    if (stateRef.current.blocks.length > 3) {
      stateRef.current.targetCameraY += CONSTANTS.BLOCK_HEIGHT;
    }

    spawnBlock(stableBlock);
  }, [gameState, score, combo, level]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleAction();
      }
      if (e.code === 'KeyT' && gameState === 'START') {
        setShowTutorial(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAction, gameState]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      initGame();
    }
  }, [gameState, initGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = (time: number) => {
      const dt = time - stateRef.current.lastTime;
      stateRef.current.lastTime = time;

      if (containerRef.current) {
        if (canvas.width !== containerRef.current.clientWidth || canvas.height !== containerRef.current.clientHeight) {
          canvas.width = containerRef.current.clientWidth;
          canvas.height = containerRef.current.clientHeight;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stateRef.current.cameraY += (stateRef.current.targetCameraY - stateRef.current.cameraY) * 0.1;
      
      if (stateRef.current.screenShake > 0) {
        stateRef.current.screenShake *= 0.9;
        ctx.save();
        ctx.translate((Math.random() - 0.5) * stateRef.current.screenShake, (Math.random() - 0.5) * stateRef.current.screenShake);
      }

      ctx.save();
      ctx.translate(0, stateRef.current.cameraY);

      stateRef.current.blocks.forEach((block) => {
        ctx.fillStyle = block.color;
        roundRect(ctx, block.x, block.y, block.width, block.height, 2);
        ctx.fill();
        ctx.strokeStyle = '#3f3f46';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      const current = stateRef.current.currentBlock;
      if (gameState === 'PLAYING' && current) {
        current.x += current.velocity * dt * current.direction;
        if (current.x + current.width > canvas.width) {
          current.direction = -1;
          current.x = canvas.width - current.width;
        } else if (current.x < 0) {
          current.direction = 1;
          current.x = 0;
        }

        ctx.fillStyle = current.color;
        roundRect(ctx, current.x, current.y, current.width, current.height, 2);
        ctx.fill();
        
        const last = stateRef.current.blocks[stateRef.current.blocks.length - 1];
        if (last && Math.abs(current.x - last.x) < CONSTANTS.PERFECT_THRESHOLD) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#2dd4bf';
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      stateRef.current.particles = stateRef.current.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life++;
        
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.globalAlpha = 1;
        return p.life < p.maxLife;
      });

      ctx.restore();
      if (stateRef.current.screenShake > 0) ctx.restore();

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationId);
  }, [gameState]);

  useEffect(() => {
    const saved = localStorage.getItem('zenith_highscore');
    if (saved) setHighScore(parseInt(saved));
  }, []);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('zenith_highscore', score.toString());
    }
  }, [score, highScore]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#09090b] text-[#f4f4f5] font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-[#3f3f46] flex flex-row items-center justify-between px-6 bg-[#09090b] z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowProtocols(!showProtocols)}
            className={`p-2 rounded-lg transition-colors ${showProtocols ? 'bg-[#2dd4bf] text-black' : 'hover:bg-white/5 text-[#a1a1aa]'}`}
            title="DMs & Protocols"
          >
            <Menu size={20} />
          </button>
          <div className="font-mono font-bold text-lg md:text-xl tracking-tighter text-[#2dd4bf] flex items-center gap-2 md:gap-3">
            <div className="w-5 h-5 md:w-6 md:h-6 border-2 border-[#2dd4bf] rounded" />
            ZENITH.vibes
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex gap-4 md:gap-8 mr-4">
            <div className="flex flex-col items-end">
              <span className="text-[8px] md:text-[10px] uppercase text-[#a1a1aa] tracking-widest leading-none">Grass</span>
              <span className="font-mono text-xs md:text-sm">+{score * 2}m</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] md:text-[10px] uppercase text-[#a1a1aa] tracking-widest leading-none">Vibe</span>
              <span className="font-mono text-xs md:text-sm text-[#2dd4bf]">{gameState === 'PLAYING' ? `${CONSTANTS.LEVELS[level-1].name}` : 'IDLE'}</span>
            </div>
          </div>
          
          <button 
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`p-2 rounded-lg transition-colors ${showAnalytics ? 'bg-[#2dd4bf] text-black' : 'hover:bg-white/5 text-[#a1a1aa]'}`}
            title="Analytics"
          >
            <BarChart2 size={20} />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden relative bg-[#09090b]">
        {/* Left Panel: DMs From Reality */}
        <AnimatePresence>
          {showProtocols && (
            <motion.aside 
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute lg:relative z-40 h-full w-72 bg-[#09090b] p-6 flex flex-col gap-6 shrink-0 border-r border-[#3f3f46] shadow-2xl lg:shadow-none"
            >
              <div className="flex justify-between items-center text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider border-b border-[#3f3f46] pb-2">
                <span>DMs From Reality</span>
                <button onClick={() => setShowProtocols(false)} className="lg:hidden text-[#3f3f46] hover:text-white"><X size={14}/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="flex flex-col gap-4">
                  {/* Mascot Character: Vibe Bot */}
                  <div className="bg-[#18181b] border border-[#3f3f46] rounded-xl p-4 flex flex-col items-center gap-3 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-1 opacity-20 pointer-events-none">
                      <div className="w-24 h-24 border border-[#2dd4bf] rounded-full -mr-12 -mt-12" />
                    </div>
                    
                    <motion.div 
                      animate={gameState === 'PLAYING' ? { 
                        y: [0, -4, 0],
                        rotate: combo > 5 ? [-2, 2, -2] : 0 
                      } : { y: 0 }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="w-16 h-16 bg-[#2dd4bf] rounded-2xl flex items-center justify-center relative z-10 shadow-[0_0_20px_rgba(45,212,191,0.2)]"
                    >
                      <div className="w-12 h-8 bg-black rounded-lg flex items-center justify-around px-2">
                        <motion.div 
                          animate={gameState === 'GAMEOVER' ? { height: 2 } : { height: [4, 8, 4] }}
                          className="w-2 bg-[#2dd4bf] rounded-full" 
                        />
                        <motion.div 
                          animate={gameState === 'GAMEOVER' ? { height: 2 } : { height: [4, 8, 4] }}
                          className="w-2 bg-[#2dd4bf] rounded-full" 
                        />
                      </div>
                      <div className="absolute -bottom-1 w-8 h-2 bg-[#14b8a6] rounded-full blur-[2px] opacity-50" />
                    </motion.div>
                    
                    <div className="text-center z-10">
                      <div className="text-[10px] text-[#2dd4bf] font-bold uppercase tracking-tighter">Vibe_Bot.v1</div>
                      <div className="text-[11px] text-[#a1a1aa] italic leading-tight mt-1">
                        {gameState === 'START' && "Yo, let's lock in."}
                        {gameState === 'PLAYING' && combo > 5 && "SLAYING FR FR."}
                        {gameState === 'PLAYING' && combo <= 5 && "U got this bestie."}
                        {gameState === 'GAMEOVER' && "Bruh... touch grass."}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded bg-[#2dd4bf]/5 border-l-2 border-[#2dd4bf]">
                    <div className="text-[10px] text-[#2dd4bf] font-mono mb-1">BESTIE_ALERT</div>
                    <div className="text-[11px] text-[#2dd4bf]/80 leading-relaxed italic">
                      "{transmission}"
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    <div className="text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider">Active Protocols</div>
                    {CONSTANTS.LEVELS.map((levelMeta, idx) => (
                      <div 
                        key={idx}
                        className={`p-3 rounded transition-all duration-500 border ${level >= idx + 1 ? 'bg-[#27272a]/50 border-[#2dd4bf]/40' : 'border-transparent opacity-20'}`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <div className="text-[11px] font-bold text-[#f4f4f5] tracking-tight">{levelMeta.name}</div>
                          {level >= idx + 1 && <div className="w-1 h-1 bg-[#2dd4bf] animate-pulse rounded-full" />}
                        </div>
                        <div className="text-[10px] text-[#a1a1aa] leading-tight">
                          {level >= idx + 1 ? levelMeta.desc : `Awaiting Level ${idx + 1}...`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Center: The Experience */}
        <section 
          ref={containerRef}
          className="flex-1 relative flex items-center justify-center cursor-crosshair overflow-hidden bg-[#09090b]"
          style={{ background: 'radial-gradient(circle at center, #141418 0%, #09090b 100%)' }}
          onPointerDown={handleAction}
        >
          {/* Subtle Grid Background */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#2dd4bf 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          
          <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
          
          {/* Character Mascot Layer (DOM layer for sharp rendering) */}
          <div className="absolute inset-0 pointer-events-none">
            {gameState === 'PLAYING' && stateRef.current.blocks.length > 0 && (
              <motion.div
                animate={{ 
                  x: stateRef.current.blocks[stateRef.current.blocks.length - 1].x + stateRef.current.blocks[stateRef.current.blocks.length - 1].width / 2 - 12,
                  y: stateRef.current.blocks[stateRef.current.blocks.length - 1].y + stateRef.current.cameraY - 32
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute w-6 h-8 flex flex-col items-center"
              >
                {/* Character Icon: Smile & Cap */}
                <div className="relative">
                  <motion.div 
                    animate={{ rotate: [0, -5, 5, 0], scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-6 h-6 bg-[#2dd4bf] rounded-full flex items-center justify-center shadow-[0_0_10px_#2dd4bf]"
                  >
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-black rounded-full" />
                      <div className="w-1 h-1 bg-black rounded-full" />
                    </div>
                  </motion.div>
                  {/* Cap detail */}
                  <div className="absolute -top-1 -right-1 w-4 h-2 bg-white rounded-full scale-y-50" />
                </div>
                {/* Body/Cape */}
                <div className="w-4 h-4 bg-[#2dd4bf]/40 rounded-b-lg border-x border-[#2dd4bf]/40" />
              </motion.div>
            )}
          </div>
          <AnimatePresence mode="wait">
            {gameState === 'START' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
                className="relative z-10 flex flex-col items-center p-12 bg-black/60 backdrop-blur-2xl border border-[#3f3f46] rounded-3xl max-w-md text-center shadow-2xl"
              >
                <div className="absolute -top-12 -left-12 w-32 h-32 bg-[#2dd4bf]/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-[#2dd4bf]/20 rounded-full blur-3xl" />
                
                <Layers className="text-[#2dd4bf] mb-6" size={56} />
                <h2 className="text-5xl font-black tracking-tighter mb-4 uppercase italic bg-gradient-to-br from-[#2dd4bf] to-white bg-clip-text text-transparent transform -skew-x-12">ZENITH_vibes</h2>
                
                <AnimatePresence mode="wait">
                  {!showTutorial ? (
                    <motion.div key="intro" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                      <p className="text-sm text-[#a1a1aa] mb-8 leading-relaxed px-4">
                        The feed is trying to ratio you. Escape the algorithm. Anchor your signal and slay the ascension. fr fr.
                      </p>
                      <div className="flex flex-col w-full gap-3">
                        <button 
                          onClick={() => {
                            initAudio();
                            setGameState('PLAYING');
                          }}
                          className="w-full py-5 bg-[#f4f4f5] text-black font-black text-lg rounded-2xl active:scale-95 transition-transform uppercase tracking-tighter shadow-lg hover:shadow-[#f4f4f5]/20"
                        >
                          Lock_In
                        </button>
                        <button 
                          onClick={() => setShowTutorial(true)}
                          className="w-full py-3 bg-white/5 border border-[#3f3f46] text-[#a1a1aa] rounded-2xl hover:bg-white/10 transition-all font-mono text-[10px] uppercase tracking-widest"
                        >
                          View_The_Blueprint
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="tutorial" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-left w-full space-y-6 mb-8">
                      <div className="space-y-4">
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-lg bg-[#2dd4bf]/20 flex items-center justify-center flex-shrink-0 text-[#2dd4bf] font-mono font-bold">01</div>
                          <div>
                            <div className="text-[11px] font-bold uppercase text-[#2dd4bf]">Tap or [SPACE]</div>
                            <div className="text-[12px] text-[#a1a1aa]">Drop the moving block. Align them to stay in the feed.</div>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-lg bg-[#2dd4bf]/20 flex items-center justify-center flex-shrink-0 text-[#2dd4bf] font-mono font-bold">02</div>
                          <div>
                            <div className="text-[11px] font-bold uppercase text-[#2dd4bf]">The Ratio</div>
                            <div className="text-[12px] text-[#a1a1aa]">Missed edges get sliced. Slower growth = easier locks.</div>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded-lg bg-[#2dd4bf]/20 flex items-center justify-center flex-shrink-0 text-[#2dd4bf] font-mono font-bold">03</div>
                          <div>
                            <div className="text-[11px] font-bold uppercase text-[#2dd4bf]">Bestie Boost</div>
                            <div className="text-[12px] text-[#a1a1aa]">Hits 3 combos to enter Neural Repair mode. Slayed blocks grow back.</div>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => setShowTutorial(false)}
                        className="w-full py-4 bg-[#2dd4bf] text-black font-bold rounded-xl uppercase text-sm tracking-tight"
                      >
                        Got it, Bestie
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="text-[10px] text-[#a1a1aa] uppercase font-mono mt-2 opacity-50">Press [SPACE] to drop • [T] for tutorial</div>
              </motion.div>
            )}

            {gameState === 'GAMEOVER' && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="relative z-10 flex flex-col items-center p-10 bg-[#09090b] border border-[#3f3f46] rounded-2xl max-w-md text-center"
              >
                <div className="text-[10px] text-[#a1a1aa] uppercase tracking-[0.4em] mb-4 font-bold">U R A LEGEND</div>
                <div className="text-7xl font-mono font-bold text-[#f4f4f5] mb-6 tracking-tighter shadow-[#2dd4bf]/20 drop-shadow-xl">{score}</div>
                
                <div className="h-px w-full bg-[#3f3f46] mb-6" />
                
                <div className="min-h-[60px] flex items-center justify-center mb-8 px-4">
                  {isLoadingWisdom ? (
                     <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <motion.div key={i} animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, delay: i * 0.2 }} className="w-1.5 h-1.5 bg-[#2dd4bf]/40 rounded-full" />
                        ))}
                      </div>
                  ) : (
                    <p className="text-sm text-[#f4f4f5] font-mono leading-relaxed uppercase tracking-tighter">"{zenWisdom}"</p>
                  )}
                </div>

                <div className="flex flex-col w-full gap-3">
                  <button 
                    onClick={() => {
                      initAudio();
                      setGameState('PLAYING');
                    }}
                    className="w-full py-4 bg-[#2dd4bf] text-black font-bold rounded-xl active:scale-95 transition-transform uppercase"
                  >
                    SLAY_AGAIN
                  </button>
                  <button 
                    onClick={() => setGameState('START')}
                    className="w-full py-4 border border-[#3f3f46] text-[#a1a1aa] font-medium rounded-xl hover:bg-white/5 transition-colors uppercase"
                  >
                    IM_FOLDING
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Gameplay HUD */}
          {gameState === 'PLAYING' && (
            <div className="absolute top-6 left-6 pointer-events-none flex flex-col gap-1 items-start">
               <span className="text-[10px] text-[#2dd4bf] font-mono animate-pulse font-bold tracking-[0.2em] shadow-glow">LOCKING_IN_0{level}</span>
               {combo > 1 && (
                 <motion.div initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="text-2xl font-mono font-black text-white italic">
                   CLEAN_x{combo}
                 </motion.div>
               )}
            </div>
          )}
        </section>

        {/* Right Panel: Analytics */}
        <AnimatePresence>
          {showAnalytics && (
            <motion.aside 
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 lg:relative z-40 h-full w-72 bg-[#09090b] p-6 flex flex-col gap-4 shrink-0 border-l border-[#3f3f46] shadow-2xl lg:shadow-none"
            >
              <div className="flex justify-between items-center text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 border-b border-[#3f3f46] pb-2">
                <span>Cognitive Metrics</span>
                <button onClick={() => setShowAnalytics(false)} className="lg:hidden text-[#3f3f46] hover:text-white"><X size={14}/></button>
              </div>
              
              <div className="bg-[#18181b] border border-[#3f3f46] rounded-xl p-4">
                <div className="text-[10px] text-[#a1a1aa] mb-2">Focus Stability Index</div>
                <div className="text-2xl font-mono font-light">{gameState === 'PLAYING' ? (0.7 + Math.random() * 0.29).toFixed(2) : '0.00'}</div>
                <div className="h-8 w-full mt-3 flex items-end gap-[2px]">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="flex-1 bg-[#2dd4bf] opacity-30" style={{ height: `${Math.random() * 100}%` }} />
                  ))}
                </div>
              </div>

              <div className="bg-[#18181b] border border-[#3f3f46] rounded-xl p-4">
                <div className="text-[10px] text-[#a1a1aa] mb-1">Flow State Depth</div>
                <div className="text-xl font-mono text-[#2dd4bf]">{score > 20 ? 'EXTREME' : score > 10 ? 'HIGH' : 'SURFACE'}</div>
              </div>

              <AnimatePresence>
                {combo >= 3 && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-[#2dd4bf]/10 border border-[#2dd4bf] rounded-xl p-4"
                  >
                    <div className="text-[10px] text-[#2dd4bf] mb-1 uppercase font-bold animate-pulse">Neural Repair Active</div>
                    <div className="text-[11px] text-[#2dd4bf]/70 leading-relaxed uppercase">Perfect drops now reconstruct block integrity.</div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="bg-[#18181b] border border-[#3f3f46] rounded-xl p-4 border-l-2 border-l-[#2dd4bf] mt-auto">
                <div className="text-[10px] text-[#2dd4bf] mb-1 uppercase font-bold">Session Record</div>
                <div className="text-2xl font-mono">{highScore}</div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="h-12 bg-[#18181b] border-t border-[#3f3f46] flex items-center justify-between px-6 font-mono text-[10px] text-[#a1a1aa]">
        <div className="hidden md:block w-48 shrink-0">STATUS: {gameState === 'PLAYING' ? 'VIBING_IN_THE_FEED' : 'IDLE_BUT_SLAYING'}</div>
        <div className="flex-1 flex justify-center items-center gap-6">
          <span className="hidden lg:inline whitespace-nowrap opacity-50">OPTIMIZATION_PROGRESS</span>
          <div className="flex-1 max-w-[600px] h-1.5 bg-[#3f3f46] rounded-full relative overflow-hidden">
            <motion.div 
              className="absolute inset-y-0 left-0 bg-[#2dd4bf] shadow-[0_0_12px_#2dd4bf]" 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, score * 2)}%` }}
            />
          </div>
          <span className="text-[#f4f4f5] font-bold shrink-0 min-w-[50px]">{Math.min(100, score * 2).toFixed(1)}%</span>
        </div>
        <div className="hidden md:block w-48 text-right shrink-0">ENV: PROD_v{score > 50 ? '2' : '1'}.0.4</div>
      </footer>
    </div>
  );
}

// Helpers
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function shadeColor(color: string, percent: number) {
  let R = parseInt(color.substring(1, 3), 16);
  let G = parseInt(color.substring(3, 5), 16);
  let B = parseInt(color.substring(5, 7), 16);

  R = Math.floor(R * (100 + percent) / 100);
  G = Math.floor(G * (100 + percent) / 100);
  B = Math.floor(B * (100 + percent) / 100);

  R = Math.min(255, R);
  G = Math.min(255, G);
  B = Math.min(255, B);

  const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
  const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
  const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

  return "#" + RR + GG + BB;
}

function getBgColor(score: number, pos: 'top' | 'bottom') {
  const level = Math.floor(score / 7);
  const gradients = [
    ['#09090b', '#18181b'], 
    ['#1e1b4b', '#1e1b4b'], 
    ['#312e81', '#1e1b4b'], 
    ['#1e3a8a', '#1e3a8a'], 
    ['#0c4a6e', '#1e3a8a'], 
    ['#0f766e', '#0c4a6e'], 
    ['#7c2d12', '#0c4a6e'], 
    ['#431407', '#000000'],
  ];
  
  const g = gradients[Math.min(level, gradients.length - 1)];
  return pos === 'top' ? g[0] : g[1];
}
