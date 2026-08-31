(() => {
  const PACKS = [
    ['Beats from the Streets','1 Beats from the Streets','P1'], ['Hello My Name Is','2 Hello My Name Is','P2'], ['Run for the Rainbow','3 Run for the Rainbow','P3'], ['Daddy Drove a Pickup','4 Daddy Drove a Pickup','P4'], ['Stretch before Sweat','5 Stretch before Sweat','P5']
  ];
  const LANE_INFO = { beat:['Beat','Back Beats'], riff:['Riff','Riffs'], lick:['Lick','Licks'], run:['Run','Runs'] };
  const $ = selector => document.querySelector(selector);
  const status = message => $('#status').textContent = message;
  const pack = $('#pack');
  PACKS.forEach(([name]) => pack.add(new Option(name, name)));

  let ctx, master, destination, bpm = 100, active = {}, linked = new Set();
  let recordingSlot = 'A', recordingSources = {}, songRecorder, songChunks = [], songUrl;
  let songTimer, songSeconds = 0, isSongPlaying = false, inputRecorder, inputChunks = [];
  let recordingBuffers = { A:null, B:null };
  const laneNodes = {};
  const fx = { input:null, output:null, lfo:null, lfoGain:null, delay:null, feedback:null, filter:null, shaper:null };

  function initAudio() {
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = .82;
    destination = ctx.createMediaStreamDestination();
    master.connect(ctx.destination); master.connect(destination);
    for (const lane of Object.keys(LANE_INFO)) {
      const input = ctx.createGain(), output = ctx.createGain();
      input.connect(output).connect(master); laneNodes[lane] = { input, output };
    }
    fx.input = ctx.createGain(); fx.output = ctx.createGain(); fx.delay = ctx.createDelay(2); fx.feedback = ctx.createGain();
    fx.filter = ctx.createBiquadFilter(); fx.filter.type = 'lowpass'; fx.shaper = ctx.createWaveShaper();
    fx.lfo = ctx.createOscillator(); fx.lfoGain = ctx.createGain(); fx.lfo.connect(fx.lfoGain).connect(fx.filter.frequency); fx.lfo.start();
    fx.input.connect(fx.delay).connect(fx.filter).connect(fx.shaper).connect(fx.output).connect(master); fx.delay.connect(fx.feedback).connect(fx.delay);
    updateFX();
  }

  function currentPack() { return PACKS.find(item => item[0] === pack.value); }
  function fileFor(lane, index) {
    const [, folder, prefix] = currentPack();
    return `audio/${encodeURIComponent(folder)}/${prefix}_B${({beat:1,riff:2,lick:3,run:4}[lane])}_${LANE_INFO[lane][0]}_0${index}.wav`;
  }
  function recordingFile(index) {
    const [, folder, prefix] = currentPack();
    return `audio/${encodeURIComponent(folder)}/${prefix}_B5_Rec_0${index}.wav`;
  }
  function loadPackRecordings() {
    recordingBuffers = { A:{url:recordingFile(1), name:'Factory recording A'}, B:{url:recordingFile(2), name:'Factory recording B'} };
    $('#inputPlay').disabled = false; $('#inputLoop').disabled = false;
  }

  function addPads() {
    for (const lane of Object.keys(LANE_INFO)) {
      const holder = $(`#${lane}Pads`); holder.innerHTML = '';
      for (let index = 1; index <= 3; index++) {
        const button = document.createElement('button');
        button.className = 'pad'; button.dataset.lane = lane; button.dataset.index = index;
        button.setAttribute('aria-pressed', 'false'); button.textContent = `${LANE_INFO[lane][1]} ${index}`;
        button.setAttribute('aria-label', `${LANE_INFO[lane][1]} loop ${index}, stopped`);
        button.addEventListener('click', () => toggleLoop(lane, index, button)); holder.append(button);
      }
    }
  }

  function setPitchMode(audio) {
    const followsSpeed = $('#pitchWithSpeed').checked;
    for (const property of ['preservesPitch', 'mozPreservesPitch', 'webkitPreservesPitch']) {
      if (property in audio) audio[property] = !followsSpeed;
    }
    audio.playbackRate = bpm / 100;
  }
  async function toggleLoop(lane, index, button) {
    initAudio(); await ctx.resume(); if (isSongPlaying) return;
    if (active[lane]?.index === index) { stopLane(lane); status(`${LANE_INFO[lane][1]} muted.`); return; }
    stopLane(lane);
    const audio = new Audio(fileFor(lane, index)); audio.loop = true; setPitchMode(audio);
    const source = ctx.createMediaElementSource(audio); source.connect(linked.has(lane) ? fx.input : laneNodes[lane].input);
    active[lane] = { audio, source, index }; await audio.play(); updateLaneUI(lane, index);
    status(`${LANE_INFO[lane][1]} ${index} playing.`);
  }
  function updateLaneUI(lane, selectedIndex) {
    document.querySelectorAll(`[data-lane="${lane}"].pad`).forEach(button => {
      const on = +button.dataset.index === selectedIndex; button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', `${LANE_INFO[lane][1]} loop ${button.dataset.index}, ${on ? 'playing' : 'stopped'}`);
    });
  }
  function stopLane(lane) {
    if (!active[lane]) return; active[lane].audio.pause(); active[lane].source.disconnect(); delete active[lane]; updateLaneUI(lane, 0);
  }
  function wireLinks() {
    document.querySelectorAll('.link').forEach(button => button.addEventListener('click', () => {
      const lane = button.dataset.lane;
      linked.has(lane) ? linked.delete(lane) : linked.add(lane);
      button.setAttribute('aria-pressed', String(linked.has(lane)));
      if (active[lane]) { const item = active[lane]; item.source.disconnect(); item.source.connect(linked.has(lane) ? fx.input : laneNodes[lane].input); }
      status(`${LANE_INFO[lane][1]} ${linked.has(lane) ? 'linked to' : 'unlinked from'} effects.`);
    }));
  }

  function updateFX() {
    const type = $('#effect').value, x = +$('#fxX').value / 100, y = +$('#fxY').value / 100;
    const descriptions = { flanger:'A sweeping jet-plane texture.', phaser:'A stepped, beat-like phase sweep.', echo:'Repeats the sound with adjustable delay and regeneration.', rewind:'Changes the linked playback speed.', fr:'Changes linked playback direction and blend.', lpf:'Removes high frequencies with resonant filtering.', distortion:'Adds saturation and harmonics.', tremolo:'Pulses the linked sound volume.', warped:'Blends feedback delay with saturation for an unstable warped sound.', swirling:'Rotates a moving band-pass filter through the linked sound.' };
    $('#fxHelp').textContent = descriptions[type];
    if (!ctx) return;
    fx.filter.type = type === 'swirling' ? 'bandpass' : 'lowpass';
    fx.filter.frequency.value = type === 'swirling' ? 400 + y * 3200 : 300 + Math.pow(1 - y, 2) * 12000; fx.filter.Q.value = type === 'swirling' ? 3 + x * 15 : x * 18;
    fx.shaper.curve = type === 'distortion' ? makeCurve(20 + x * 500) : type === 'warped' ? makeCurve(20 + y * 280) : null;
    fx.delay.delayTime.value = type === 'warped' ? .03 + y * .28 : ['echo','flanger','phaser'].includes(type) ? .02 + x * .7 : 0;
    fx.feedback.gain.value = type === 'warped' ? .08 + x * .62 : type === 'echo' ? .08 + x * .42 : 0;
    fx.lfo.frequency.value = type === 'swirling' ? .12 + x * 3 : .01;
    fx.lfoGain.gain.value = type === 'swirling' ? 150 + y * 2300 : 0;
    fx.output.gain.value = (+$('#fxLevel').value / 100) * .85;
    Object.values(active).forEach(({audio}) => setPitchMode(audio));
  }
  function makeCurve(amount) { const curve = new Float32Array(44100); for (let i = 0; i < curve.length; i++) { const x = i * 2 / curve.length - 1; curve[i] = (1 + amount) * x / (1 + amount * Math.abs(x)); } return curve; }
  function setBPM(value) { bpm = Math.max(60, Math.min(180, value)); $('#bpmOut').textContent = `${bpm} BPM`; updateFX(); }
  function click() { if (!ctx) return; const oscillator = ctx.createOscillator(), gain = ctx.createGain(); oscillator.frequency.value = 1500; gain.gain.setValueAtTime(.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .05); oscillator.connect(gain).connect(master); oscillator.start(); oscillator.stop(ctx.currentTime + .06); }

  function recordSong() {
    initAudio(); if (songRecorder?.state === 'recording') { songRecorder.stop(); return; }
    songChunks = []; songSeconds = 0; $('#songRecord').disabled = true; status('Four-beat count-in. Song recording will start after four clicks.'); let count = 0;
    const countIn = setInterval(() => { click(); count++; if (count === 4) { clearInterval(countIn); songRecorder = new MediaRecorder(destination.stream); songRecorder.ondataavailable = event => songChunks.push(event.data); songRecorder.onstop = finishSong; songRecorder.start(); $('#songRecord').disabled = false; $('#songRecord').setAttribute('aria-pressed','true'); status('Recording song. No time limit.'); songTimer = setInterval(() => { $('#songTime').textContent = new Date(++songSeconds * 1000).toISOString().slice(14,19); }, 1000); } }, 600);
  }
  function finishSong() { clearInterval(songTimer); if (songUrl) URL.revokeObjectURL(songUrl); songUrl = URL.createObjectURL(new Blob(songChunks, {type:songChunks[0]?.type || 'audio/webm'})); $('#songRecord').setAttribute('aria-pressed','false'); $('#songPlay').disabled = false; $('#exportSong').disabled = false; status(`Song captured: ${$('#songTime').textContent}.`); }
  function toggleSongPlayback() { if (!songUrl) return; const audio = $('#songPreview') || Object.assign(document.createElement('audio'), {id:'songPreview'}); if (!audio.parentNode) document.body.append(audio); if (isSongPlaying) { audio.pause(); isSongPlaying = false; $('#songPlay').textContent = '▶ Play Song'; enableControls(true); return; } audio.src = songUrl; audio.onended = () => { isSongPlaying = false; $('#songPlay').textContent = '▶ Play Song'; enableControls(true); }; isSongPlaying = true; audio.play(); $('#songPlay').textContent = '■ Stop Song'; enableControls(false); }
  function enableControls(enabled) { document.querySelectorAll('.lanes button,.lower button,.lower select,.lower input,#pack,#reset').forEach(control => control.disabled = !enabled); $('#songPlay').disabled = !songUrl; }

  async function recordInput() {
    initAudio(); if (inputRecorder?.state === 'recording') { inputRecorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true}); inputChunks = []; inputRecorder = new MediaRecorder(stream);
      inputRecorder.ondataavailable = event => inputChunks.push(event.data);
      inputRecorder.onstop = () => { const url = URL.createObjectURL(new Blob(inputChunks, {type:inputChunks[0]?.type || 'audio/webm'})); recordingBuffers[recordingSlot] = {url, name:'Microphone recording'}; $('#inputPlay').disabled = false; $('#inputLoop').disabled = false; $('#inputRecord').setAttribute('aria-pressed','false'); status(`Ten-second recording saved to slot ${recordingSlot}.`); stream.getTracks().forEach(track => track.stop()); };
      inputRecorder.start(); $('#inputRecord').setAttribute('aria-pressed','true'); status(`Recording microphone to slot ${recordingSlot}; it stops after ten seconds.`); setTimeout(() => { if (inputRecorder.state === 'recording') inputRecorder.stop(); }, 10000);
    } catch { status('Microphone access was not available.'); }
  }
  function importAudio(event) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('audio/')) { status('Choose an audio file to import.'); return; }
    if (recordingBuffers[recordingSlot]?.imported) URL.revokeObjectURL(recordingBuffers[recordingSlot].url);
    recordingBuffers[recordingSlot] = {url:URL.createObjectURL(file), name:file.name, imported:true};
    $('#inputPlay').disabled = false; $('#inputLoop').disabled = false; event.target.value = '';
    status(`${file.name} imported into slot ${recordingSlot}.`);
  }
  function playRecording(loop = false) {
    const item = recordingBuffers[recordingSlot]; if (!item) return; initAudio();
    if (recordingSources[recordingSlot]) { recordingSources[recordingSlot].audio.pause(); recordingSources[recordingSlot].source.disconnect(); delete recordingSources[recordingSlot]; $('#inputLoop').setAttribute('aria-pressed','false'); return; }
    const audio = new Audio(item.url); audio.loop = loop; setPitchMode(audio); const source = ctx.createMediaElementSource(audio);
    source.connect($('#inputLink').getAttribute('aria-pressed') === 'true' ? fx.input : master);
    audio.onended = () => { source.disconnect(); delete recordingSources[recordingSlot]; }; recordingSources[recordingSlot] = {audio, source}; audio.play(); $('#inputLoop').setAttribute('aria-pressed',String(loop)); status(`${item.name} ${loop ? 'looping' : 'playing once'}.`);
  }
  function reset() { Object.keys(LANE_INFO).forEach(stopLane); Object.values(recordingSources).forEach(item => item.audio.pause()); recordingSources = {}; linked.clear(); document.querySelectorAll('.link,#inputLink').forEach(item => item.setAttribute('aria-pressed','false')); setBPM(100); $('#effect').value = 'flanger'; $('#fxX').value = $('#fxY').value = 50; $('#fxLevel').value = 70; $('#fxLevelOut').textContent = '70%'; $('#hold').checked = false; status('Desk reset.'); }
  async function changePack() { const preserve = Object.entries(active).map(([lane, item]) => [lane, item.index]); Object.keys(LANE_INFO).forEach(stopLane); loadPackRecordings(); for (const [lane, index] of preserve) await toggleLoop(lane, index, document.querySelector(`[data-lane="${lane}"][data-index="${index}"]`)); status(`${pack.value} loaded; all active lanes changed instruments together.`); }

  let taps = []; $('#tap').onclick = () => { const now = performance.now(); taps = [...taps, now].filter(time => now - time < 2400); if (taps.length > 1) setBPM(Math.round(60000 / ((now - taps[0]) / (taps.length - 1)))); status(`Tap tempo: ${bpm} BPM.`); };
  ['bpmDown','bpmUp'].forEach(id => { const direction = id === 'bpmDown' ? -1 : 1, button = $('#'+id); button.onclick = () => setBPM(bpm + direction); button.onpointerdown = () => button._hold = setTimeout(() => setBPM(100), 700); button.onpointerup = button.onpointerleave = () => clearTimeout(button._hold); });
  $('#masterVolume').oninput = event => { initAudio(); master.gain.value = event.target.value / 100; $('#volumeOut').textContent = event.target.value + '%'; };
  $('#effect').onchange = updateFX; $('#fxX').oninput = updateFX; $('#fxY').oninput = updateFX;
  $('#fxLevel').oninput = event => { updateFX(); $('#fxLevelOut').textContent = event.target.value + '%'; };
  $('#pitchWithSpeed').onchange = () => { updateFX(); status(`Tempo will ${$('#pitchWithSpeed').checked ? 'change pitch with speed' : 'preserve pitch'}.`); };
  $('#pack').onchange = changePack; $('#slot').onchange = event => { recordingSlot = event.target.value; $('#inputPlay').disabled = !recordingBuffers[recordingSlot]; $('#inputLoop').disabled = !recordingBuffers[recordingSlot]; status(`Recording slot ${recordingSlot} selected.`); };
  $('#inputRecord').onclick = recordInput; $('#importAudio').onchange = importAudio; $('#inputPlay').onclick = () => playRecording(false); $('#inputLoop').onclick = () => playRecording(true);
  $('#inputLink').onclick = event => { const on = event.currentTarget.getAttribute('aria-pressed') !== 'true'; event.currentTarget.setAttribute('aria-pressed',String(on)); status(`Recording ${on ? 'linked to' : 'unlinked from'} effects.`); };
  $('#songRecord').onclick = recordSong; $('#songPlay').onclick = toggleSongPlayback; $('#exportSong').onclick = () => { const link = document.createElement('a'); link.href = songUrl; link.download = 'UCreate-song.webm'; link.click(); status('Song export started.'); }; $('#reset').onclick = reset;
  addPads(); wireLinks(); loadPackRecordings();
})();
