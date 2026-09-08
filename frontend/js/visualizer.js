/* ==========================================================================
   WizardFM — Audio Visualizer
   ========================================================================== */

(() => {
  'use strict';

  const canvas = document.getElementById('visualizer');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let audioContext = null;
  let analyser = null;
  let source = null;
  let animationId = null;
  let isRunning = false;
  let dataArray = null;
  let bufferLength = 0;

  // Colors
  const COLORS = {
    purple: { r: 124, g: 58, b: 237 },
    gold: { r: 251, g: 191, b: 36 },
    blue: { r: 99, g: 102, b: 241 },
  };

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 48 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '48px';
    ctx.scale(dpr, dpr);
  }

  function start(audioElement) {
    if (isRunning) return;

    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      if (!source) {
        source = audioContext.createMediaElementSource(audioElement);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.8;

        source.connect(analyser);
        analyser.connect(audioContext.destination);
      }

      bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);

      isRunning = true;
      resizeCanvas();
      draw();
    } catch (err) {
      console.warn('Visualizer failed to start:', err);
      drawIdleBars();
    }
  }

  function stop() {
    isRunning = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    drawIdleBars();
  }

  function draw() {
    if (!isRunning) return;
    animationId = requestAnimationFrame(draw);

    analyser.getByteFrequencyData(dataArray);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);

    const barCount = Math.min(bufferLength, 48);
    const totalGap = (barCount - 1) * 2;
    const barWidth = (width - totalGap) / barCount;
    const maxBarHeight = height - 4;

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i] / 255;
      const barHeight = Math.max(2, value * maxBarHeight);

      const x = i * (barWidth + 2);
      const y = (height - barHeight) / 2;

      // Color gradient: purple -> gold based on frequency
      const t = i / barCount;
      const r = Math.round(COLORS.purple.r + (COLORS.gold.r - COLORS.purple.r) * t);
      const g = Math.round(COLORS.purple.g + (COLORS.gold.g - COLORS.purple.g) * t);
      const b = Math.round(COLORS.purple.b + (COLORS.gold.b - COLORS.purple.b) * t);

      const alpha = 0.5 + value * 0.5;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();

      // Glow effect for active bars
      if (value > 0.5) {
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  function drawIdleBars() {
    resizeCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);

    const barCount = 48;
    const totalGap = (barCount - 1) * 2;
    const barWidth = (width - totalGap) / barCount;

    for (let i = 0; i < barCount; i++) {
      const barHeight = 2;
      const x = i * (barWidth + 2);
      const y = (height - barHeight) / 2;

      ctx.fillStyle = 'rgba(124, 58, 237, 0.15)';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1);
      ctx.fill();
    }
  }

  // Handle resize
  window.addEventListener('resize', () => {
    if (isRunning) {
      resizeCanvas();
    } else {
      drawIdleBars();
    }
  });

  // Draw idle state initially
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', drawIdleBars);
  } else {
    drawIdleBars();
  }

  // Expose API
  window.WizardVisualizer = { start, stop };
})();
