// === BGM & SE Generator using Web Audio API ===
// 乙女ゲーム風：ピアノ・ストリングス中心の柔らかいサウンド
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.seGain = null;
    this.currentBGM = null;
    this.bgmEnabled = true;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.ctx.destination);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.3;
    this.bgmGain.connect(this.masterGain);
    this.seGain = this.ctx.createGain();
    this.seGain.gain.value = 0.4;
    this.seGain.connect(this.masterGain);
    this.initialized = true;
  }

  toggleBGM() {
    this.bgmEnabled = !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopBGM();
    }
    return this.bgmEnabled;
  }

  // Note helper
  noteFreq(note, octave) {
    const notes = { C:0, 'C#':1, Db:1, D:2, 'D#':3, Eb:3, E:4, F:5, 'F#':6, Gb:6, G:7, 'G#':8, Ab:8, A:9, 'A#':10, Bb:10, B:11 };
    return 440 * Math.pow(2, (notes[note] + (octave - 4) * 12 - 9) / 12);
  }

  // === 乙女ゲーム向け音色 ===

  // ピアノ音色：急速なアタック＋指数減衰
  createPiano(freq, startTime, duration, velocity = 0.12) {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // ピアノは sine + 微かな倍音
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.0; // 第2倍音
    const gain2 = this.ctx.createGain();
    gain2.gain.value = velocity * 0.15; // 倍音は控えめ

    filter.type = 'lowpass';
    filter.frequency.value = Math.min(freq * 4, 4000);
    filter.Q.value = 0.5;

    // ピアノ的エンベロープ：急速アタック→指数減衰
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(velocity, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(velocity * 0.5, startTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    osc2.connect(gain2);
    gain2.connect(this.bgmGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    osc2.start(startTime);
    osc2.stop(startTime + duration + 0.05);

    return [{ osc, gain }, { osc: osc2, gain: gain2 }];
  }

  // ストリングスパッド：ゆっくりアタック・持続
  createStringPad(freq, startTime, duration, vol = 0.06) {
    const nodes = [];
    // 複数のデチューンしたオシレータで厚みを出す
    const detunes = [-6, 0, 6];
    detunes.forEach(detune => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;

      const fadeIn = Math.min(duration * 0.25, 1.2);
      const fadeOut = Math.min(duration * 0.3, 1.5);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + fadeIn);
      gain.gain.setValueAtTime(vol, startTime + duration - fadeOut);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);

      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.1);
      nodes.push({ osc, gain });
    });
    return nodes;
  }

  // アルペジオ：分散和音（乙女ゲームの定番）
  createArpeggio(chordFreqs, startTime, noteDur, gap, velocity = 0.1) {
    const nodes = [];
    chordFreqs.forEach((freq, i) => {
      const t = startTime + i * gap;
      nodes.push(...this.createPiano(freq, t, noteDur, velocity));
    });
    return nodes;
  }

  // グロッケン/ベル音：高周波の儚い音
  createBell(freq, startTime, duration, vol = 0.06) {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const gain2 = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.76; // ベル倍音比

    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    gain2.gain.setValueAtTime(vol * 0.3, startTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.6);

    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc2.connect(gain2);
    gain2.connect(this.bgmGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
    osc2.start(startTime);
    osc2.stop(startTime + duration * 0.6 + 0.1);
    return [{ osc, gain }, { osc: osc2, gain: gain2 }];
  }

  // === BGM Tracks ===

  // タイトル：幻想的・静謐・青い世界
  playBGM_title() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 24;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // Dm9 - Bbmaj7 - Gm7 - Asus4 - Am（神秘的で少し切ない進行）
      const chords = [
        { notes: [['D',3],['F',3],['A',3],['C',4],['E',4]], dur: 6 },
        { notes: [['Bb',2],['D',3],['F',3],['A',3]], dur: 6 },
        { notes: [['G',2],['Bb',2],['D',3],['F',3]], dur: 6 },
        { notes: [['A',2],['D',3],['E',3],['A',3]], dur: 6 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 0.5, 0.05));
        });
        t += chord.dur;
      });
      // ベル音でキラキラ
      const bells = [
        ['A',5,1,3],['E',5,3,3],['F',5,5,2],
        ['D',5,7,3],['F',5,10,2],['A',5,12.5,3],
        ['G',5,15,2],['D',5,17,3],['E',5,20,4],
      ];
      bells.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createBell(this.noteFreq(note, oct), now + start, dur, 0.04));
      });
      // 静かなピアノアルペジオ
      const arp1 = ['D','F','A','C','E'].map(n => this.noteFreq(n, 4));
      nodes.push(...this.createArpeggio(arp1, now + 0.5, 2.5, 0.6, 0.06));
      const arp2 = ['Bb','D','F','A'].map(n => this.noteFreq(n, 4));
      nodes.push(...this.createArpeggio(arp2, now + 6.5, 2.5, 0.6, 0.06));
      const arp3 = ['G','Bb','D','F'].map(n => this.noteFreq(n, 4));
      nodes.push(...this.createArpeggio(arp3, now + 12.5, 2.5, 0.6, 0.06));
      const arp4 = ['A','D','E','A'].map(n => this.noteFreq(n, 4));
      nodes.push(...this.createArpeggio(arp4, now + 18.5, 2.5, 0.6, 0.06));
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  // あたたかい：プロローグ・日常シーン（ピアノアルペジオ＋ストリングス）
  playBGM_warm() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 20;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // F - C/E - Dm - Bb - C（あたたかい進行）
      const chords = [
        { notes: [['F',3],['A',3],['C',4]], dur: 4 },
        { notes: [['E',3],['G',3],['C',4]], dur: 4 },
        { notes: [['D',3],['F',3],['A',3]], dur: 4 },
        { notes: [['Bb',2],['D',3],['F',3]], dur: 4 },
        { notes: [['C',3],['E',3],['G',3]], dur: 4 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 0.8, 0.04));
        });
        // ピアノアルペジオ（和音を分散）
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        nodes.push(...this.createArpeggio(arpFreqs, now + t + 0.2, 1.8, 0.45, 0.08));
        // 2拍目にもう一度
        nodes.push(...this.createArpeggio(arpFreqs, now + t + 2.0, 1.8, 0.45, 0.06));
        t += chord.dur;
      });
      // やさしいメロディ（ピアノ）
      const melody = [
        ['A',4,0.3,1.2],['C',5,1.6,0.8],['A',4,2.8,1.5],
        ['G',4,4.5,1.2],['E',4,5.8,1.5],
        ['F',4,8.3,1.2],['A',4,9.8,1],['D',5,11,1.5],
        ['C',5,13,1.5],['Bb',4,14.8,1.2],
        ['C',5,16.5,1.5],['A',4,18.2,1.8],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.1));
      });
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  // 明るい：春の偕楽園・お花見（軽やかなピアノ＋ベル）
  playBGM_bright() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 16;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // G - D - Em - C（明るく軽やか）
      const chords = [
        { notes: [['G',3],['B',3],['D',4]], dur: 4 },
        { notes: [['D',3],['F#',3],['A',3]], dur: 4 },
        { notes: [['E',3],['G',3],['B',3]], dur: 4 },
        { notes: [['C',3],['E',3],['G',3]], dur: 4 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 0.5, 0.035));
        });
        // 軽快なアルペジオ
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        nodes.push(...this.createArpeggio(arpFreqs, now + t, 1.2, 0.3, 0.09));
        nodes.push(...this.createArpeggio(arpFreqs.reverse(), now + t + 2, 1.2, 0.3, 0.07));
        t += chord.dur;
      });
      // 春らしいベル
      const bells = [
        ['D',6,0.5,2],['B',5,2.5,1.5],
        ['A',5,5,2],['F#',5,7.5,1.5],
        ['G',5,9,2],['E',5,11,1.5],
        ['G',5,13,2],['D',5,15,1.5],
      ];
      bells.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createBell(this.noteFreq(note, oct), now + start, dur, 0.035));
      });
      // 明るいメロディ
      const melody = [
        ['B',4,0,0.9],['D',5,1,0.9],['G',5,2,1.5],
        ['F#',5,4,0.9],['E',5,5,0.9],['D',5,6,1.5],
        ['E',5,8,1],['G',5,9.2,0.8],['B',5,10.2,1.5],
        ['A',5,12,1],['G',5,13.2,0.8],['D',5,14.2,1.8],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.1));
      });
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  // 切ない：千波湖・門番の真実（ピアノソロ＋細いストリングス）
  playBGM_melancholy() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 24;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // Am - F - Dm - Em - Am（切ない短調）
      const chords = [
        { notes: [['A',2],['C',3],['E',3]], dur: 5 },
        { notes: [['F',2],['A',2],['C',3]], dur: 5 },
        { notes: [['D',2],['F',2],['A',2]], dur: 5 },
        { notes: [['E',2],['G',2],['B',2]], dur: 4.5 },
        { notes: [['A',2],['C',3],['E',3]], dur: 4.5 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 1, 0.04));
        });
        t += chord.dur;
      });
      // 切ないピアノメロディ（ゆっくり）
      const melody = [
        ['E',4,0,2.5],['D',4,2.8,1.5],['C',4,4.5,2],
        ['A',3,7,2.5],['C',4,9.8,1.5],['D',4,11.5,2],
        ['F',4,14,2],['E',4,16.2,2],['D',4,18.5,1.5],
        ['C',4,20.5,2],['B',3,22.5,1.5],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur + 0.5, 0.1));
      });
      // 静かなアルペジオ（背景に控えめに）
      nodes.push(...this.createArpeggio(
        ['A','C','E'].map(n => this.noteFreq(n, 4)), now + 1, 3, 0.8, 0.04
      ));
      nodes.push(...this.createArpeggio(
        ['F','A','C'].map(n => this.noteFreq(n, 4)), now + 6, 3, 0.8, 0.04
      ));
      nodes.push(...this.createArpeggio(
        ['D','F','A'].map(n => this.noteFreq(n, 4)), now + 12, 3, 0.8, 0.04
      ));
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  // ジャズ風：カフェ・大人のシーン（ジャズコード＋ピアノ）
  playBGM_jazz() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 20;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // Fmaj7 - Em7 - Dm7 - Cmaj7 - Bbmaj7（おしゃれジャズ）
      const chords = [
        { notes: [['F',3],['A',3],['C',4],['E',4]], dur: 4 },
        { notes: [['E',3],['G',3],['B',3],['D',4]], dur: 4 },
        { notes: [['D',3],['F',3],['A',3],['C',4]], dur: 4 },
        { notes: [['C',3],['E',3],['G',3],['B',3]], dur: 4 },
        { notes: [['Bb',2],['D',3],['F',3],['A',3]], dur: 4 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 0.3, 0.03));
        });
        // ジャズっぽいピアノ（スイング風に間をずらす）
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        nodes.push(...this.createPiano(arpFreqs[0], now + t + 0.1, 1.5, 0.08));
        nodes.push(...this.createPiano(arpFreqs[2], now + t + 0.6, 1.2, 0.06));
        nodes.push(...this.createPiano(arpFreqs[1], now + t + 1.8, 1.5, 0.07));
        nodes.push(...this.createPiano(arpFreqs[3], now + t + 2.8, 1.5, 0.06));
        t += chord.dur;
      });
      // ジャズメロディ
      const melody = [
        ['A',4,0.8,1],['C',5,2,1.2],['E',5,3.5,1.5],
        ['D',5,5.5,1],['B',4,6.8,1.5],
        ['A',4,9,1.2],['F',4,10.5,1],['A',4,12,1.8],
        ['G',4,14.5,1.2],['E',4,16,1.5],
        ['F',4,18,2],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur + 0.3, 0.09));
      });
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  // 緊張：最終章前半・決断のとき（低音ストリングス＋ピアノ）
  playBGM_tense() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 20;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // Dm - Am/C - Bb - Gm - A（ドラマチックな短調）
      const chords = [
        { notes: [['D',2],['A',2],['D',3],['F',3]], dur: 4 },
        { notes: [['C',2],['A',2],['C',3],['E',3]], dur: 4 },
        { notes: [['Bb',1],['Bb',2],['D',3],['F',3]], dur: 4 },
        { notes: [['G',2],['Bb',2],['D',3]], dur: 4 },
        { notes: [['A',2],['C#',3],['E',3]], dur: 4 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 1, 0.05));
        });
        t += chord.dur;
      });
      // 低いピアノの刻み（緊張感）
      const pulse = [
        ['D',3,0,0.8],['D',3,1.2,0.8],['D',3,2.4,0.8],
        ['C',3,4,0.8],['C',3,5.2,0.8],['C',3,6.4,0.8],
        ['Bb',2,8,0.8],['Bb',2,9.2,0.8],['D',3,10.4,0.8],
        ['G',2,12,0.8],['Bb',2,13.2,0.8],['D',3,14.4,0.8],
        ['A',2,16,1.2],['C#',3,17.5,1.2],['E',3,19,1],
      ];
      pulse.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.08));
      });
      // 高音の旋律（切迫感のある）
      const melody = [
        ['F',5,1,2],['E',5,3.5,1.5],
        ['E',5,5,2],['D',5,7.5,1.5],
        ['D',5,9,2],['F',5,11.5,1.5],
        ['D',5,13,2],['Bb',4,15.5,1.5],
        ['C#',5,17,3],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.07));
      });
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  // クライマックス：J1昇格・感動（壮大なストリングス＋ピアノ）
  playBGM_climax() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 20;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // D - A - Bm - G - D - A - G - A（壮大・感動的な進行）
      const chords = [
        { notes: [['D',3],['F#',3],['A',3],['D',4]], dur: 2.5 },
        { notes: [['A',2],['C#',3],['E',3],['A',3]], dur: 2.5 },
        { notes: [['B',2],['D',3],['F#',3],['B',3]], dur: 2.5 },
        { notes: [['G',2],['B',2],['D',3],['G',3]], dur: 2.5 },
        { notes: [['D',3],['F#',3],['A',3],['D',4]], dur: 2.5 },
        { notes: [['A',2],['C#',3],['E',3],['A',3]], dur: 2.5 },
        { notes: [['G',2],['B',2],['D',3],['G',3]], dur: 2.5 },
        { notes: [['A',2],['C#',3],['E',3],['A',3]], dur: 2.5 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          // 厚みのあるストリングス
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 1, 0.06));
        });
        // アルペジオ（高音域）
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        nodes.push(...this.createArpeggio(arpFreqs, now + t, 1.5, 0.25, 0.07));
        t += chord.dur;
      });
      // 壮大なメロディ
      const melody = [
        ['F#',5,0,1.2],['A',5,1.5,1.2],['D',6,3,2],
        ['C#',6,5.5,1.2],['B',5,7,1.5],
        ['A',5,9,1.2],['B',5,10.5,1],['D',6,12,2],
        ['C#',6,14.5,1.5],['A',5,16.5,1.5],['B',5,18.5,1.5],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.11));
      });
      // ベル（きらきらした輝き）
      nodes.push(...this.createBell(this.noteFreq('D', 6), now + 3, 3, 0.04));
      nodes.push(...this.createBell(this.noteFreq('A', 5), now + 9, 3, 0.04));
      nodes.push(...this.createBell(this.noteFreq('D', 6), now + 15, 3, 0.04));
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  // エンディング：静かな幸福感（ゆっくりピアノ＋ストリングス）
  playBGM_ending() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 24;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // C - Am - F - G - Em - Am - Dm - G - C（幸福感のある長い進行）
      const chords = [
        { notes: [['C',3],['E',3],['G',3]], dur: 3 },
        { notes: [['A',2],['C',3],['E',3]], dur: 3 },
        { notes: [['F',2],['A',2],['C',3]], dur: 3 },
        { notes: [['G',2],['B',2],['D',3]], dur: 2.5 },
        { notes: [['E',2],['G',2],['B',2]], dur: 2.5 },
        { notes: [['A',2],['C',3],['E',3]], dur: 2.5 },
        { notes: [['D',2],['F',2],['A',2]], dur: 3 },
        { notes: [['G',2],['B',2],['D',3]], dur: 2 },
        { notes: [['C',3],['E',3],['G',3]], dur: 2.5 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 1.5, 0.045));
        });
        // ゆったりしたアルペジオ
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        nodes.push(...this.createArpeggio(arpFreqs, now + t + 0.3, 2, 0.6, 0.07));
        t += chord.dur;
      });
      // エンディングメロディ（穏やかで幸せ）
      const melody = [
        ['E',5,0.5,2],['G',5,3,1.5],['E',5,5,2],
        ['D',5,7.5,1.5],['C',5,9.5,2],
        ['B',4,12,1.5],['C',5,14,1.5],['E',5,16,2],
        ['D',5,18.5,1.5],['C',5,20.5,3.5],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.09));
      });
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  // バッドエンド：深い悲しみ（遅いピアノ＋重いストリングス）
  playBGM_sad() {
    if (!this.bgmEnabled) return;
    this.init();
    this.stopBGM();
    const nodes = [];
    const loopDuration = 24;
    const play = () => {
      if (!this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      // Am - Dm - E7 - Am - F - Dm - E（悲哀の進行）
      const chords = [
        { notes: [['A',2],['C',3],['E',3]], dur: 4 },
        { notes: [['D',2],['F',2],['A',2]], dur: 4 },
        { notes: [['E',2],['G#',2],['B',2],['D',3]], dur: 3.5 },
        { notes: [['A',2],['C',3],['E',3]], dur: 3.5 },
        { notes: [['F',2],['A',2],['C',3]], dur: 3 },
        { notes: [['D',2],['F',2],['A',2]], dur: 3 },
        { notes: [['E',2],['G#',2],['B',2]], dur: 3 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          nodes.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 2, 0.05));
        });
        t += chord.dur;
      });
      // 悲しいメロディ（ゆっくり、一音一音）
      const melody = [
        ['E',4,0.5,3],['D',4,4,2.5],['C',4,7,3],
        ['B',3,10.5,2],['A',3,13,3],
        ['C',4,16.5,2.5],['B',3,19.5,2],['A',3,22,2],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        nodes.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur + 1, 0.09));
      });
      // 低音のベル（弔いの鐘）
      nodes.push(...this.createBell(this.noteFreq('A', 4), now + 2, 5, 0.03));
      nodes.push(...this.createBell(this.noteFreq('E', 4), now + 10, 5, 0.03));
      nodes.push(...this.createBell(this.noteFreq('A', 4), now + 18, 5, 0.03));
    };
    play();
    this.currentBGM = { interval: setInterval(play, loopDuration * 1000), nodes };
  }

  stopBGM() {
    if (this.currentBGM) {
      clearInterval(this.currentBGM.interval);
      this.currentBGM.nodes.forEach(n => {
        try { n.osc.stop(); } catch(e) {}
      });
      this.currentBGM = null;
    }
  }

  // === Sound Effects ===
  // クリック音：柔らかいベル
  playSE_click() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // 選択肢音：きらきらした上昇音
  playSE_choice() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // 上昇する3音
    [880, 1100, 1320].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.12, t + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.25);
    });
  }

  // 歓声（スタジアム）
  playSE_cheer() {
    if (!this.initialized) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.8));
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.3);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.seGain);
    source.start();
  }

  // ホイッスル
  playSE_whistle() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2800, t);
    osc.frequency.linearRampToValueAtTime(2400, t + 0.8);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.setValueAtTime(0.12, t + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + 0.85);
  }

  // Play BGM by name
  playBGM(name) {
    const bgmMap = {
      'title': () => this.playBGM_title(),
      'warm': () => this.playBGM_warm(),
      'bright': () => this.playBGM_bright(),
      'melancholy': () => this.playBGM_melancholy(),
      'jazz': () => this.playBGM_jazz(),
      'tense': () => this.playBGM_tense(),
      'climax': () => this.playBGM_climax(),
      'ending': () => this.playBGM_ending(),
      'sad': () => this.playBGM_sad(),
      'silence': () => this.stopBGM(),
    };
    if (bgmMap[name]) bgmMap[name]();
  }

  // Play SE by name
  playSE(name) {
    const seMap = {
      'click': () => this.playSE_click(),
      'choice': () => this.playSE_choice(),
      'cheer': () => this.playSE_cheer(),
      'whistle': () => this.playSE_whistle(),
    };
    if (seMap[name]) seMap[name]();
  }
}

const audioManager = new AudioManager();
