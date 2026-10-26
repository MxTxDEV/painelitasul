#!/usr/bin/env python3
"""Trilha + efeitos do comercial ITASUL OS, sintetizados com numpy (sem amostras externas).
Mesmos instantes de video/cues.json usados pela imagem. 120 BPM (compasso = 2 s), tom de Lá menor.
Uso: python3 video/audio.py <saida.wav>"""
import json, sys, wave
import numpy as np

SR = 48000
CUES = json.load(open(__file__.replace('audio.py', 'cues.json')))
DUR = CUES['duration']
N = int((DUR + 3) * SR)          # folga para as caudas de reverb
rng = np.random.default_rng(42)
BEAT, STEP = 60 / CUES['bpm'], 60 / CUES['bpm'] / 4

# ---------- utilidades ----------
def tt(d): return np.arange(int(d * SR)) / SR
def env(n, a, d):                       # ataque linear + decaimento exponencial
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d); return e
def fft_filter(x, lo=0, hi=SR / 2, soft=200):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.clip((f - lo) / soft + .5, 0, 1) * np.clip((hi - f) / soft + .5, 0, 1); return np.fft.irfft(X * m, len(x))
def noise(n, lo=0, hi=SR / 2): return fft_filter(rng.standard_normal(n), lo, hi)
def midi(n): return 440 * 2 ** ((n - 69) / 12)
def put(buf, sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i < 0: sig, i = sig[-i:], 0
    if i >= buf.shape[1] or len(sig) == 0: return
    j = min(buf.shape[1], i + len(sig)); s = sig[:j - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:j] += s * l * 1.414; buf[1, i:j] += s * r * 1.414
def saw(f, n, harm=18, detune=0.0):
    t = np.arange(n) / SR; out = np.zeros(n)
    for k in range(1, harm + 1):
        if f * k * (1 + detune) > SR / 2.2: break
        out += np.sin(2 * np.pi * f * k * (1 + detune) * t) / k
    return out * .6
def reverb(x, tail=2.6, wet_lp=7000, seed=1):
    r = np.random.default_rng(seed); n = int(tail * SR); t = np.arange(n) / SR
    ir = np.stack([fft_filter(r.standard_normal(n), 120, wet_lp, 400) * np.exp(-t / (tail / 4.2)) for _ in range(2)])
    ir[:, :int(.012 * SR)] *= np.linspace(0, 1, int(.012 * SR)); ir /= np.sqrt((ir ** 2).sum(1, keepdims=True)) + 1e-9
    L = 1 << int(np.ceil(np.log2(x.shape[1] + n))); out = np.zeros_like(x)
    for c in range(2):
        out[c] = np.fft.irfft(np.fft.rfft(x[c], L) * np.fft.rfft(ir[c], L), L)[:x.shape[1]]
    return out

# ---------- instrumentos ----------
def kick(vel=1.0):
    n = int(.55 * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * (46 * t + 125 * .028 * (1 - np.exp(-t / .028)))
    return (np.sin(ph) * np.exp(-t / .21) + .35 * noise(n, 2500, 9000) * np.exp(-t / .004)) * vel
def clap(vel=1.0):
    n = int(.4 * SR); out = np.zeros(n); b = noise(n, 900, 7500)
    for off in (0, .011, .023): i = int(off * SR); out[i:] += b[:n - i] * np.exp(-np.arange(n - i) / SR / .009)
    return (out + b * np.exp(-np.arange(n) / SR / .11) * .6) * .5 * vel
def hat(open_=False, vel=1.0):
    n = int((.3 if open_ else .07) * SR); return noise(n, 7500, 18000) * np.exp(-np.arange(n) / SR / (.09 if open_ else .014)) * vel * .55
def snare(vel=1.0):
    n = int(.3 * SR); t = np.arange(n) / SR
    return (noise(n, 1500, 9000) * np.exp(-t / .07) * .7 + np.sin(2 * np.pi * 190 * t) * np.exp(-t / .05) * .6) * vel
def bass(f, d=.22, vel=1.0):
    n = int(d * 1.6 * SR); t = np.arange(n) / SR
    e = np.minimum(1, t / .004) * np.exp(-t / d)
    return (np.sin(2 * np.pi * f * t) * .9 + saw(f, n, 7) * .45 * np.exp(-t / .12)) * e * vel
def pluck(f, d=.38, vel=1.0):
    n = int(d * 5 * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for k in range(1, 15):
        if f * k > SR / 2.3: break
        out += np.sin(2 * np.pi * f * k * t) / k * np.exp(-t * (1 / d + 5.5 * k))
    return out * np.minimum(1, t / .002) * vel * .8
def pad(freqs, d, vel=1.0):
    n = int(d * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for f in freqs:
        for det in (-.0045, 0, .0045): out += saw(f, n, 9, det) * .22
    a = np.minimum(1, t / .9) * np.minimum(1, (d - t) / .9); return out * a * vel
def whoosh(d, rev=False, f0=300, f1=7000):
    n = int(d * SR); t = np.linspace(0, 1, n); out = np.zeros(n); cs = np.geomspace(f0, f1, 9)
    for i, c in enumerate(cs):
        out += fft_filter(rng.standard_normal(n), c * .7, c * 1.4, c * .12) * np.exp(-((t - (.12 + .76 * i / 8)) ** 2) / (2 * .09 ** 2))
    e = np.sin(np.pi * np.clip(t, 0, 1)) ** 1.5; out = out * e / (np.abs(out).max() + 1e-9)
    if rev: out = (out * np.linspace(.15, 1, n) ** 1.6)[::-1][::-1]
    return out
def impact(vel=1.0):
    n = int(3.2 * SR); t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * (34 + 60 * np.exp(-t / .09)) * t) * np.exp(-t / .9)
    thud = noise(n, 40, 600) * np.exp(-t / .22) * .8
    crash = noise(n, 3000, 15000) * np.exp(-t / .55) * .22
    return (sub * 1.1 + thud + crash) * vel
def riser(d):
    n = int(d * SR); t = np.arange(n) / SR; x = t / d
    f = 180 * (1 + 9 * x ** 2.2); tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * .35
    nz = noise(n, 2500, 14000) * (x ** 2.4) * .9
    return (tone * x ** 1.5 + nz) * np.minimum(1, (d - t) / .02)
def tick(vel=1.0, f=2400):
    n = int(.09 * SR); t = np.arange(n) / SR; return (np.sin(2 * np.pi * f * t) * np.exp(-t / .012) + noise(n, 3000, 12000) * np.exp(-t / .004) * .6) * vel * .6
def click(vel=1.0):
    n = int(.12 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1500 * t) * np.exp(-t / .006) * .6 + np.sin(2 * np.pi * 220 * t) * np.exp(-t / .03) * .7 + noise(n, 2000, 9000) * np.exp(-t / .003) * .5) * vel
def pop(vel=1.0):
    n = int(.25 * SR); t = np.arange(n) / SR; ph = 2 * np.pi * np.cumsum(260 + 520 * (1 - np.exp(-t / .03))) / SR
    return (np.sin(ph) * np.exp(-t / .07) + .3 * np.sin(2 * ph) * np.exp(-t / .04)) * vel
def bell(f, d=1.4, vel=1.0):
    n = int(d * 5 * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for r, a, dd in ((1, 1, 1), (2.76, .5, .6), (5.4, .3, .35), (8.9, .15, .2)): out += np.sin(2 * np.pi * f * r * t) * a * np.exp(-t / (d * dd))
    return out * np.minimum(1, t / .002) * vel * .5
def shimmer(vel=1.0):
    n = int(1.6 * SR); t = np.arange(n) / SR; out = noise(n, 6000, 16000) * (np.exp(-t / .5) * .5)
    for f in (1318, 1760, 2637, 3520): out += np.sin(2 * np.pi * f * t) * np.exp(-t / .5) * .25
    sw = noise(int(.35 * SR), 4000, 14000) * np.linspace(0, 1, int(.35 * SR)) ** 2 * .4
    return np.concatenate([sw, out]) * vel
def alert(vel=1.0):
    n = int(.12 * SR); t = np.arange(n) / SR; one = np.sin(2 * np.pi * 523 * t) * np.exp(-t / .05)
    return np.concatenate([one, np.sin(2 * np.pi * 392 * t) * np.exp(-t / .07)]) * vel * .5

# ---------- partitura ----------
music = np.zeros((2, N)); sfx = np.zeros((2, N)); rsend = np.zeros((2, N)); msend = np.zeros((2, N))
CH = [(57, [57, 60, 64, 69], 33), (53, [53, 57, 60, 65], 29), (60, [60, 64, 67, 72], 36), (55, [55, 59, 62, 67], 31)]  # Am F C G: (raiz, notas, baixo MIDI)
def chord_at(bar): return CH[bar % 4]
kick_times = []
def groove(t):        # 0 off · 1 batida de coração · 2 groove cheio · 3 leve
    if 4 <= t < 10: return 1
    if 10 <= t < 32: return 2
    if 38 <= t < 42: return 3
    return 0
bars = int(DUR / (4 * BEAT))
for bar in range(bars):
    t0 = bar * 4 * BEAT; root, notes, bmidi = chord_at(bar); g = groove(t0)
    # pad contínuo por compasso (acordes com sobreposição suave)
    plev = .5 if t0 < 4 else (.45 if g == 2 else .75 if 32 <= t0 < 38 else .55)
    if t0 >= 46: plev *= max(0, 1 - (t0 - 46) / 2.2)
    put(music, pad([midi(n - 12) for n in notes[:3]] + [midi(notes[3])], 4 * BEAT + 1.0), t0 - .4, plev * .55, pan=0)
    if t0 < 4: put(music, bass(midi(33), 1.8) * .5, t0, .6)     # bordão grave da abertura
    for s in range(16):
        ts = t0 + s * STEP
        if ts >= DUR: break
        g = groove(ts); strong = s % 4 == 0
        if g == 1:                                               # tensão: batida de coração + relógio
            if s in (0, 6): put(music, kick(.55 + .35 * (ts - 4) / 6), ts, .8); kick_times.append(ts)
            if s % 2 == 0: put(music, hat(False, .35 + .25 * (ts - 4) / 6), ts, .7, pan=.3)
            if s in (0, 6, 8): put(music, bass(midi(bmidi), .3), ts, .55 + .25 * (ts - 4) / 6)
        if g in (2, 3):
            lvl = 1.0 if g == 2 else .75
            if 32 <= ts < 36: lvl = 0                            # respiro (sem kick) no bloco do tema
            if s % 4 == 0 and lvl: put(music, kick(1.0), ts, .95 * lvl); kick_times.append(ts)
            if s in (4, 12) and lvl and g == 2: put(music, clap(.9), ts, .8, pan=-.1)
            if s % 2 == 0 and lvl: put(music, hat(False, 1.0 if s % 4 == 2 else .6), ts, .6 * lvl, pan=.35)
            if s in (6, 14) and lvl and g == 2: put(music, hat(True, .8), ts, .55, pan=-.35)
            if 26 <= ts < 32 and s % 2 == 1: put(music, hat(False, .3), ts, .5, pan=.5)
            if lvl and s in (0, 3, 6, 8, 10, 12, 14): put(music, bass(midi(bmidi if s < 8 else bmidi + (12 if s in (10, 14) else 0)), .2), ts, .9 * lvl)
        # arpejo (todo trecho de groove e respiro do tema)
        if (10 <= ts < 36) or (38 <= ts < 42):
            idx = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 2][s]; vel = (.9 if s % 4 == 0 else .55) * (.8 if 32 <= ts < 36 else 1)
            n_ = notes[idx] + (12 if (s // 8) % 2 else 0)
            p = pluck(midi(n_), .28, vel)
            put(music, p, ts, .34, pan=-.4 if s % 2 else .4); put(msend, p, ts, .25); put(music, p, ts + BEAT * .75, .09, pan=.4 if s % 2 else -.4)
# rufos de caixa (8,0→9,9 acelerando; 40,0→41,9 acelerando) e silêncio de 100 ms antes do impacto
for a, b in ((8.0, 9.9), (40.0, 41.9)):
    t = a
    while t < b:
        k = (t - a) / (b - a); put(music, snare(.35 + .7 * k), t, .75, pan=0); t += STEP * (2 if k < .45 else 1 if k < .8 else .5)
# acorde de impacto da abertura/encerramento (stab Lá menor add9) + cauda
for t0, vel in ((2.0, .9), (42.0, 1.0)):
    for n_ in (45, 57, 60, 64, 69, 71): put(music, pad([midi(n_)], 5.0), t0 - .02, .5 * vel); put(msend, pad([midi(n_)], 3.0), t0, .3 * vel)
# ---------- efeitos sonoros por marcações ----------
S = CUES['sfx']
for t0, d in S['riser']: put(sfx, riser(d), t0, .7, pan=0)
for t0, v in S['impact']: x = impact(v); put(sfx, x, t0, .95); put(rsend, x, t0, .22)
for c in S['whoosh']:
    t0, d = c[0], c[1]; w = whoosh(d, 'rev' in c); put(sfx, w, t0 - (d * .45 if 'rev' in c else 0), .55, pan=0); put(rsend, w, t0, .15)
for i, (t0,) in enumerate(S['tick']): put(sfx, tick(1, 2000 + 140 * i), t0, .7, pan=-.2 if i % 2 else .2)
for i, (t0,) in enumerate(S['chip']): put(sfx, tick(.8, 1400 + 90 * i), t0, .55, pan=-.5 + i / 13)
for (t0,) in S['click']: put(sfx, click(1), t0, .75)
for i, (t0,) in enumerate(S['pop']): put(sfx, pop(1), t0, .7, pan=-.4 + .4 * i); put(rsend, pop(1), t0, .25)
for (t0,) in S['shimmer']: x = shimmer(.7); put(sfx, x, t0, .8); put(rsend, x, t0, .3)
for (t0,) in S['ding']: x = bell(midi(81), 1.8, 1); put(sfx, x, t0, .8); put(rsend, x, t0, .45); put(sfx, bell(midi(88), 1.2, .5), t0 + .08, .5, pan=.3)
for (t0,) in S['alert']: put(sfx, alert(1), t0, .55)
# notas dos cartões do mapa (pentatônica de Lá menor ascendente), uma por cartão
PENT = [69, 72, 74, 76, 79, 81, 84, 81, 79, 76, 74, 72, 69]
for i, n_ in enumerate(PENT):
    t0 = CUES['nodeRevealStart'] + i * CUES['nodeRevealStep']; x = pluck(midi(n_), .45, 1); put(sfx, x, t0, .5, pan=-.5 + i / 12); put(rsend, x, t0, .3)

# ---------- mixagem ----------
def duck(sig, times, depth=.55, rel=.14):
    g = np.ones(N)
    for kt in times:
        i = int(kt * SR); j = min(N, i + int(.5 * SR)); g[i:j] = np.minimum(g[i:j], 1 - depth * np.exp(-np.arange(j - i) / SR / rel))
    return sig * g
mus = duck(music, kick_times) * .62
rv = reverb(rsend + msend * .9, 2.8) * 1.1
mix = mus + sfx * .95 + rv
# corte de 100 ms de silêncio antes dos impactos (suspense)
for t0 in (10.0, 42.0):
    i, j = int((t0 - .1) * SR), int(t0 * SR); mix[:, i:j] *= np.linspace(.15, .0, j - i)
mix = mix[:, :int(DUR * SR)]
mix *= np.minimum(1, np.arange(mix.shape[1]) / SR / .3)                     # entrada
mix *= np.minimum(1, (DUR - np.arange(mix.shape[1]) / SR) / 1.4)            # saída suave
mix = np.tanh(mix * 1.15) / np.tanh(1.15)                                    # saturação suave (cola)
mix /= np.abs(mix).max() / .92
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype('<i2').tobytes())
print(f'áudio gerado: {mix.shape[1] / SR:.1f}s, pico {np.abs(mix).max():.2f}')
