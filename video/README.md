# Comercial ITASUL OS (48 s · 1920×1080 · 30 fps · áudio estéreo)

Vídeo gerado por código: o **painel real** roda dentro de uma composição HTML controlada por uma função pura do tempo
(`renderFrame(t)`), capturada quadro a quadro; a trilha e os efeitos são sintetizados com numpy a partir das mesmas
marcações de tempo (`cues.json`), então imagem e som ficam sincronizados.

- `compose.html` / `compose.js` — direção de arte, câmera, cenas, legendas, destaques (cliques programáticos no painel real)
- `cues.json` — marcações de tempo compartilhadas (impactos, cliques, notas, cortes)
- `audio.py` — trilha (120 BPM, Lá menor) + efeitos, sem amostras externas
- `render.mjs` — captura dos quadros (Chromium/Playwright, 4 processos) e prévias
- `out/itasul-os-comercial.mp4` — resultado final

Regerar:
```
node video/render.mjs --frames /tmp/frames --workers 4
python3 video/audio.py /tmp/audio.wav
ffmpeg -framerate 30 -i /tmp/frames/f%05d.jpg -i /tmp/audio.wav -af "loudnorm=I=-14:TP=-1.5:LRA=9,afade=t=out:st=46.6:d=1.4" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart video/out/itasul-os-comercial.mp4
```
Os dados mostrados no painel são de **demonstração** (equipes genéricas, sem pessoas reais) e o vídeo traz o aviso
"imagens ilustrativas". Nada do projeto é alterado durante a renderização (navegador isolado).
