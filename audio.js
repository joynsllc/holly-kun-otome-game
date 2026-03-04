// === BGM & SE Generator using Web Audio API ===
// 乙女ゲーム風：ピアノ・ストリングス中心の柔らかいサウンド
// ループは setInterval ではなく scheduleNextLoop で正確にスケジュール
class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.seGain = null;
    this.currentBGM = null;
    this.bgmEnabled = true;
    this.initialized = false;
    this._currentBGMName = null;
    this._lastBGMName = null;
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
      this._lastBGMName = this._currentBGMName || null;
      this.stopBGM();
    } else if (this._lastBGMName) {
      this.playBGM(this._lastBGMName);
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

    osc.type = 'sine';
    osc.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.0;
    const gain2 = this.ctx.createGain();
    gain2.gain.value = velocity * 0.15;

    filter.type = 'lowpass';
    filter.frequency.value = Math.min(freq * 4, 4000);
    filter.Q.value = 0.5;

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

    return [osc, osc2];
  }

  // ストリングスパッド：ゆっくりアタック・持続
  createStringPad(freq, startTime, duration, vol = 0.06) {
    const oscs = [];
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
      oscs.push(osc);
    });
    return oscs;
  }

  // アルペジオ：分散和音
  createArpeggio(chordFreqs, startTime, noteDur, gap, velocity = 0.1) {
    const oscs = [];
    chordFreqs.forEach((freq, i) => {
      const t = startTime + i * gap;
      oscs.push(...this.createPiano(freq, t, noteDur, velocity));
    });
    return oscs;
  }

  // グロッケン/ベル音
  createBell(freq, startTime, duration, vol = 0.06) {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const gain2 = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.76;

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
    return [osc, osc2];
  }

  // === BGM ループ管理 ===
  // setInterval ではなく、Web Audio API のタイムラインで正確にスケジュール
  _startBGMLoop(playFn, loopDuration) {
    this.stopBGM();
    const oscs = [];
    let stopped = false;
    let loopTimeoutId = null;

    const scheduleLoop = () => {
      if (stopped || !this.bgmEnabled) return;
      const now = this.ctx.currentTime + 0.1;
      const newOscs = playFn(now);
      oscs.push(...newOscs);
      // 古いオシレータ（すでに stop 済み）を配列から除外してメモリ節約
      // 2ループ分だけ保持
      while (oscs.length > newOscs.length * 2) {
        oscs.shift();
      }
      // 次ループを loopDuration 秒後にスケジュール（少し余裕を持って早めに）
      loopTimeoutId = setTimeout(scheduleLoop, (loopDuration - 0.5) * 1000);
    };

    scheduleLoop();

    this.currentBGM = {
      stop: () => {
        stopped = true;
        if (loopTimeoutId) clearTimeout(loopTimeoutId);
        oscs.forEach(o => { try { o.stop(); } catch(e) {} });
        oscs.length = 0;
      }
    };
  }

  // === BGM Tracks ===

  // タイトル：幻想的・静謐・青い世界
  playBGM_title() {
    this._startBGMLoop((now) => {
      const oscs = [];
      const chords = [
        { notes: [['D',3],['F',3],['A',3],['C',4],['E',4]], dur: 6 },
        { notes: [['Bb',2],['D',3],['F',3],['A',3]], dur: 6 },
        { notes: [['G',2],['Bb',2],['D',3],['F',3]], dur: 6 },
        { notes: [['A',2],['D',3],['E',3],['A',3]], dur: 6 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 0.5, 0.05));
        });
        t += chord.dur;
      });
      const bells = [
        ['A',5,1,3],['E',5,3,3],['F',5,5,2],
        ['D',5,7,3],['F',5,10,2],['A',5,12.5,3],
        ['G',5,15,2],['D',5,17,3],['E',5,20,4],
      ];
      bells.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createBell(this.noteFreq(note, oct), now + start, dur, 0.04));
      });
      const arp1 = ['D','F','A','C','E'].map(n => this.noteFreq(n, 4));
      oscs.push(...this.createArpeggio(arp1, now + 0.5, 2.5, 0.6, 0.06));
      const arp2 = ['Bb','D','F','A'].map(n => this.noteFreq(n, 4));
      oscs.push(...this.createArpeggio(arp2, now + 6.5, 2.5, 0.6, 0.06));
      const arp3 = ['G','Bb','D','F'].map(n => this.noteFreq(n, 4));
      oscs.push(...this.createArpeggio(arp3, now + 12.5, 2.5, 0.6, 0.06));
      const arp4 = ['A','D','E','A'].map(n => this.noteFreq(n, 4));
      oscs.push(...this.createArpeggio(arp4, now + 18.5, 2.5, 0.6, 0.06));
      return oscs;
    }, 24);
  }

  // あたたかい：プロローグ・日常シーン
  playBGM_warm() {
    this._startBGMLoop((now) => {
      const oscs = [];
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
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 0.8, 0.04));
        });
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        oscs.push(...this.createArpeggio(arpFreqs, now + t + 0.2, 1.8, 0.45, 0.08));
        oscs.push(...this.createArpeggio(arpFreqs, now + t + 2.0, 1.8, 0.45, 0.06));
        t += chord.dur;
      });
      const melody = [
        ['A',4,0.3,1.2],['C',5,1.6,0.8],['A',4,2.8,1.5],
        ['G',4,4.5,1.2],['E',4,5.8,1.5],
        ['F',4,8.3,1.2],['A',4,9.8,1],['D',5,11,1.5],
        ['C',5,13,1.5],['Bb',4,14.8,1.2],
        ['C',5,16.5,1.5],['A',4,18.2,1.8],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.1));
      });
      return oscs;
    }, 20);
  }

  // 明るい：春の偕楽園・お花見
  playBGM_bright() {
    this._startBGMLoop((now) => {
      const oscs = [];
      const chords = [
        { notes: [['G',3],['B',3],['D',4]], dur: 4 },
        { notes: [['D',3],['F#',3],['A',3]], dur: 4 },
        { notes: [['E',3],['G',3],['B',3]], dur: 4 },
        { notes: [['C',3],['E',3],['G',3]], dur: 4 },
      ];
      let t = 0;
      chords.forEach(chord => {
        chord.notes.forEach(([note, oct]) => {
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 0.5, 0.035));
        });
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        oscs.push(...this.createArpeggio(arpFreqs, now + t, 1.2, 0.3, 0.09));
        oscs.push(...this.createArpeggio([...arpFreqs].reverse(), now + t + 2, 1.2, 0.3, 0.07));
        t += chord.dur;
      });
      const bells = [
        ['D',6,0.5,2],['B',5,2.5,1.5],
        ['A',5,5,2],['F#',5,7.5,1.5],
        ['G',5,9,2],['E',5,11,1.5],
        ['G',5,13,2],['D',5,15,1.5],
      ];
      bells.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createBell(this.noteFreq(note, oct), now + start, dur, 0.035));
      });
      const melody = [
        ['B',4,0,0.9],['D',5,1,0.9],['G',5,2,1.5],
        ['F#',5,4,0.9],['E',5,5,0.9],['D',5,6,1.5],
        ['E',5,8,1],['G',5,9.2,0.8],['B',5,10.2,1.5],
        ['A',5,12,1],['G',5,13.2,0.8],['D',5,14.2,1.8],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.1));
      });
      return oscs;
    }, 16);
  }

  // 切ない：千波湖・門番の真実
  playBGM_melancholy() {
    this._startBGMLoop((now) => {
      const oscs = [];
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
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 1, 0.04));
        });
        t += chord.dur;
      });
      const melody = [
        ['E',4,0,2.5],['D',4,2.8,1.5],['C',4,4.5,2],
        ['A',3,7,2.5],['C',4,9.8,1.5],['D',4,11.5,2],
        ['F',4,14,2],['E',4,16.2,2],['D',4,18.5,1.5],
        ['C',4,20.5,2],['B',3,22.5,1.5],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur + 0.5, 0.1));
      });
      oscs.push(...this.createArpeggio(
        ['A','C','E'].map(n => this.noteFreq(n, 4)), now + 1, 3, 0.8, 0.04
      ));
      oscs.push(...this.createArpeggio(
        ['F','A','C'].map(n => this.noteFreq(n, 4)), now + 6, 3, 0.8, 0.04
      ));
      oscs.push(...this.createArpeggio(
        ['D','F','A'].map(n => this.noteFreq(n, 4)), now + 12, 3, 0.8, 0.04
      ));
      return oscs;
    }, 24);
  }

  // ジャズ風：カフェ・大人のシーン
  playBGM_jazz() {
    this._startBGMLoop((now) => {
      const oscs = [];
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
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 0.3, 0.03));
        });
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        oscs.push(...this.createPiano(arpFreqs[0], now + t + 0.1, 1.5, 0.08));
        oscs.push(...this.createPiano(arpFreqs[2], now + t + 0.6, 1.2, 0.06));
        oscs.push(...this.createPiano(arpFreqs[1], now + t + 1.8, 1.5, 0.07));
        oscs.push(...this.createPiano(arpFreqs[3 % arpFreqs.length], now + t + 2.8, 1.5, 0.06));
        t += chord.dur;
      });
      const melody = [
        ['A',4,0.8,1],['C',5,2,1.2],['E',5,3.5,1.5],
        ['D',5,5.5,1],['B',4,6.8,1.5],
        ['A',4,9,1.2],['F',4,10.5,1],['A',4,12,1.8],
        ['G',4,14.5,1.2],['E',4,16,1.5],
        ['F',4,18,2],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur + 0.3, 0.09));
      });
      return oscs;
    }, 20);
  }

  // 緊張：最終章前半・決断のとき
  playBGM_tense() {
    this._startBGMLoop((now) => {
      const oscs = [];
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
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 1, 0.05));
        });
        t += chord.dur;
      });
      const pulse = [
        ['D',3,0,0.8],['D',3,1.2,0.8],['D',3,2.4,0.8],
        ['C',3,4,0.8],['C',3,5.2,0.8],['C',3,6.4,0.8],
        ['Bb',2,8,0.8],['Bb',2,9.2,0.8],['D',3,10.4,0.8],
        ['G',2,12,0.8],['Bb',2,13.2,0.8],['D',3,14.4,0.8],
        ['A',2,16,1.2],['C#',3,17.5,1.2],['E',3,19,1],
      ];
      pulse.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.08));
      });
      const melody = [
        ['F',5,1,2],['E',5,3.5,1.5],
        ['E',5,5,2],['D',5,7.5,1.5],
        ['D',5,9,2],['F',5,11.5,1.5],
        ['D',5,13,2],['Bb',4,15.5,1.5],
        ['C#',5,17,3],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.07));
      });
      return oscs;
    }, 20);
  }

  // クライマックス：J1昇格・感動
  playBGM_climax() {
    this._startBGMLoop((now) => {
      const oscs = [];
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
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 1, 0.06));
        });
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        oscs.push(...this.createArpeggio(arpFreqs, now + t, 1.5, 0.25, 0.07));
        t += chord.dur;
      });
      const melody = [
        ['F#',5,0,1.2],['A',5,1.5,1.2],['D',6,3,2],
        ['C#',6,5.5,1.2],['B',5,7,1.5],
        ['A',5,9,1.2],['B',5,10.5,1],['D',6,12,2],
        ['C#',6,14.5,1.5],['A',5,16.5,1.5],['B',5,18.5,1.5],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.11));
      });
      oscs.push(...this.createBell(this.noteFreq('D', 6), now + 3, 3, 0.04));
      oscs.push(...this.createBell(this.noteFreq('A', 5), now + 9, 3, 0.04));
      oscs.push(...this.createBell(this.noteFreq('D', 6), now + 15, 3, 0.04));
      return oscs;
    }, 20);
  }

  // エンディング：静かな幸福感
  playBGM_ending() {
    this._startBGMLoop((now) => {
      const oscs = [];
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
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 1.5, 0.045));
        });
        const arpFreqs = chord.notes.map(([n, o]) => this.noteFreq(n, o + 1));
        oscs.push(...this.createArpeggio(arpFreqs, now + t + 0.3, 2, 0.6, 0.07));
        t += chord.dur;
      });
      const melody = [
        ['E',5,0.5,2],['G',5,3,1.5],['E',5,5,2],
        ['D',5,7.5,1.5],['C',5,9.5,2],
        ['B',4,12,1.5],['C',5,14,1.5],['E',5,16,2],
        ['D',5,18.5,1.5],['C',5,20.5,3.5],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur, 0.09));
      });
      return oscs;
    }, 24);
  }

  // バッドエンド：深い悲しみ
  playBGM_sad() {
    this._startBGMLoop((now) => {
      const oscs = [];
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
          oscs.push(...this.createStringPad(this.noteFreq(note, oct), now + t, chord.dur + 2, 0.05));
        });
        t += chord.dur;
      });
      const melody = [
        ['E',4,0.5,3],['D',4,4,2.5],['C',4,7,3],
        ['B',3,10.5,2],['A',3,13,3],
        ['C',4,16.5,2.5],['B',3,19.5,2],['A',3,22,2],
      ];
      melody.forEach(([note, oct, start, dur]) => {
        oscs.push(...this.createPiano(this.noteFreq(note, oct), now + start, dur + 1, 0.09));
      });
      oscs.push(...this.createBell(this.noteFreq('A', 4), now + 2, 5, 0.03));
      oscs.push(...this.createBell(this.noteFreq('E', 4), now + 10, 5, 0.03));
      oscs.push(...this.createBell(this.noteFreq('A', 4), now + 18, 5, 0.03));
      return oscs;
    }, 24);
  }

  stopBGM() {
    if (this.currentBGM) {
      this.currentBGM.stop();
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

  // シーン転換音：深いベル＋ストリングスのうねり
  playSE_scene_change() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    // 深いベル
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2);
    osc.connect(gain);
    gain.connect(this.seGain);
    osc.start(t);
    osc.stop(t + 2.1);
    // 倍音
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 440 * 2.76;
    gain2.gain.setValueAtTime(0.04, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    osc2.connect(gain2);
    gain2.connect(this.seGain);
    osc2.start(t);
    osc2.stop(t + 1.3);
    // 上昇アルペジオ
    [523, 659, 784].forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + 0.2 + i * 0.15);
      g.gain.linearRampToValueAtTime(0.06, t + 0.2 + i * 0.15 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2 + i * 0.15 + 0.8);
      o.connect(g);
      g.connect(this.seGain);
      o.start(t + 0.2 + i * 0.15);
      o.stop(t + 0.2 + i * 0.15 + 0.85);
    });
  }

  // 感動SE：きらきらしたベル連打（エンディング・重要シーン）
  playSE_sparkle() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    const freqs = [1047, 1319, 1568, 1760, 2093];
    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const st = t + i * 0.1;
      gain.gain.setValueAtTime(0, st);
      gain.gain.linearRampToValueAtTime(0.08, st + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.6);
      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(st);
      osc.stop(st + 0.65);
    });
  }

  // ドキッとする音（心臓の鼓動風）
  playSE_heartbeat() {
    if (!this.initialized) return;
    const t = this.ctx.currentTime;
    [0, 0.25].forEach(offset => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 60;
      gain.gain.setValueAtTime(0, t + offset);
      gain.gain.linearRampToValueAtTime(0.2, t + offset + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.3);
      osc.connect(gain);
      gain.connect(this.seGain);
      osc.start(t + offset);
      osc.stop(t + offset + 0.35);
    });
  }

  // ため息・風SE
  playSE_wind() {
    if (!this.initialized) return;
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.4);
    gain.gain.linearRampToValueAtTime(0, t + 1.5);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.seGain);
    source.start(t);
    source.stop(t + 1.5);
  }

  // Play BGM by name
  playBGM(name) {
    if (name !== 'silence') {
      this._currentBGMName = name;
    }
    if (!this.bgmEnabled && name !== 'silence') return;
    this.init();
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
      'scene_change': () => this.playSE_scene_change(),
      'sparkle': () => this.playSE_sparkle(),
      'heartbeat': () => this.playSE_heartbeat(),
      'wind': () => this.playSE_wind(),
    };
    if (seMap[name]) seMap[name]();
  }
}

const audioManager = new AudioManager();
