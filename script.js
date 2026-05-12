const els = {
  imageInput: document.getElementById("imageInput"),
  dropzone: document.getElementById("dropzone"),
  fileInfo: document.getElementById("fileInfo"),
  scaleSelect: document.getElementById("scaleSelect"),
  formatSelect: document.getElementById("formatSelect"),
  sharpness: document.getElementById("sharpness"),
  brightness: document.getElementById("brightness"),
  contrast: document.getElementById("contrast"),
  saturation: document.getElementById("saturation"),
  sharpValue: document.getElementById("sharpValue"),
  brightValue: document.getElementById("brightValue"),
  contrastValue: document.getElementById("contrastValue"),
  satValue: document.getElementById("satValue"),
  enhanceBtn: document.getElementById("enhanceBtn"),
  progressWrap: document.getElementById("progressWrap"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  emptyState: document.getElementById("emptyState"),
  compareBox: document.getElementById("compareBox"),
  beforeImg: document.getElementById("beforeImg"),
  afterImg: document.getElementById("afterImg"),
  afterLayer: document.getElementById("afterLayer"),
  compareSlider: document.getElementById("compareSlider"),
  compareHandle: document.getElementById("compareHandle"),
  resultActions: document.getElementById("resultActions"),
  downloadBtn: document.getElementById("downloadBtn"),
  resetBtn: document.getElementById("resetBtn"),
  year: document.getElementById("year"),
};

let selectedFile = null;
let sourceObjectUrl = "";
let resultBlobUrl = "";
let resultBlob = null;
let resultFileName = "foto-hd.png";

const MAX_CANVAS_AREA = 30_000_000;

els.year.textContent = new Date().getFullYear();

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach((node) => revealObserver.observe(node));

function updateSliderLabels() {
  els.sharpValue.textContent = els.sharpness.value;
  els.brightValue.textContent = els.brightness.value;
  els.contrastValue.textContent = els.contrast.value;
  els.satValue.textContent = els.saturation.value;
}

[els.sharpness, els.brightness, els.contrast, els.saturation].forEach((input) => {
  input.addEventListener("input", updateSliderLabels);
});
updateSliderLabels();

function setProgress(value) {
  const rounded = Math.max(0, Math.min(100, Math.round(value)));
  els.progressBar.style.width = `${rounded}%`;
  els.progressText.textContent = `${rounded}%`;
}

function setLoading(isLoading) {
  els.enhanceBtn.disabled = isLoading || !selectedFile;
  els.enhanceBtn.classList.toggle("loading", isLoading);
  els.enhanceBtn.querySelector(".btn-text").textContent = isLoading ? "Sedang diproses..." : "Jadikan Foto HD";
  els.progressWrap.classList.toggle("active", isLoading);
  els.progressWrap.setAttribute("aria-hidden", String(!isLoading));
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function revokeUrls() {
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
  sourceObjectUrl = "";
  resultBlobUrl = "";
}

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Pilih file gambar JPG, PNG, atau WEBP ya.");
    return;
  }

  selectedFile = file;
  resultBlob = null;
  revokeUrls();

  sourceObjectUrl = URL.createObjectURL(file);
  els.beforeImg.src = sourceObjectUrl;
  els.fileInfo.textContent = `${file.name} • ${formatBytes(file.size)}`;
  els.enhanceBtn.disabled = false;
  els.emptyState.hidden = true;
  els.compareBox.hidden = false;
  els.resultActions.hidden = true;
  els.afterImg.removeAttribute("src");
  els.afterLayer.style.width = "0%";
  updateCompare(0);
}

els.imageInput.addEventListener("change", (event) => {
  handleFile(event.target.files?.[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("dragover");
  });
});

els.dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files?.[0];
  handleFile(file);
});

function updateCompare(value = els.compareSlider.value) {
  const numericValue = Number(value);
  const width = `${numericValue}%`;
  const ratio = Math.max(0.01, numericValue / 100);
  els.afterLayer.style.width = width;
  els.afterLayer.style.setProperty("--clip-ratio", ratio);
  els.compareHandle.style.left = width;
}

els.compareSlider.addEventListener("input", () => updateCompare());

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gambar gagal dibaca."));
    };
    img.src = url;
  });
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function getSafeScale(width, height, wantedScale) {
  const wantedArea = width * height * wantedScale * wantedScale;
  if (wantedArea <= MAX_CANVAS_AREA) return wantedScale;
  return Math.max(1, Math.sqrt(MAX_CANVAS_AREA / (width * height)));
}

function drawUpscaled(img, scale) {
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let currentCanvas = createCanvas(img.naturalWidth, img.naturalHeight);
  let currentCtx = currentCanvas.getContext("2d");
  currentCtx.drawImage(img, 0, 0);

  let currentWidth = img.naturalWidth;
  let currentHeight = img.naturalHeight;

  while (currentWidth * 1.5 < width && currentHeight * 1.5 < height) {
    currentWidth = Math.min(width, Math.round(currentWidth * 1.5));
    currentHeight = Math.min(height, Math.round(currentHeight * 1.5));
    const stepCanvas = createCanvas(currentWidth, currentHeight);
    const stepCtx = stepCanvas.getContext("2d");
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = "high";
    stepCtx.drawImage(currentCanvas, 0, 0, currentWidth, currentHeight);
    currentCanvas = stepCanvas;
  }

  ctx.drawImage(currentCanvas, 0, 0, width, height);
  return canvas;
}

function clamp(value) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function enhanceImageData(imageData, options) {
  const { width, height, data } = imageData;
  const original = new Uint8ClampedArray(data);
  const blurred = new Uint8ClampedArray(data.length);
  const sharpAmount = Number(options.sharpness) / 100 * 1.55;
  const brightness = Number(options.brightness) * 2.2;
  const contrastValue = Number(options.contrast);
  const saturationValue = Number(options.saturation);
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const saturationFactor = 1 + saturationValue / 100;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let totalWeight = 0;

      for (let ky = -1; ky <= 1; ky += 1) {
        const py = Math.min(height - 1, Math.max(0, y + ky));
        for (let kx = -1; kx <= 1; kx += 1) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const weight = (kx === 0 && ky === 0) ? 4 : (kx === 0 || ky === 0 ? 2 : 1);
          const pIndex = (py * width + px) * 4;
          totalR += original[pIndex] * weight;
          totalG += original[pIndex + 1] * weight;
          totalB += original[pIndex + 2] * weight;
          totalWeight += weight;
        }
      }

      blurred[index] = totalR / totalWeight;
      blurred[index + 1] = totalG / totalWeight;
      blurred[index + 2] = totalB / totalWeight;
      blurred[index + 3] = original[index + 3];
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    let r = original[i] + (original[i] - blurred[i]) * sharpAmount;
    let g = original[i + 1] + (original[i + 1] - blurred[i + 1]) * sharpAmount;
    let b = original[i + 2] + (original[i + 2] - blurred[i + 2]) * sharpAmount;

    r = contrastFactor * (r - 128) + 128 + brightness;
    g = contrastFactor * (g - 128) + 128 + brightness;
    b = contrastFactor * (b - 128) + 128 + brightness;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturationFactor;
    g = gray + (g - gray) * saturationFactor;
    b = gray + (b - gray) * saturationFactor;

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }

  return imageData;
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve) => {
    const quality = type === "image/png" ? undefined : 0.94;
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function enhanceSelectedImage() {
  if (!selectedFile) return;

  setLoading(true);
  setProgress(4);

  try {
    await nextFrame();
    const img = await loadImageFromFile(selectedFile);
    setProgress(18);

    const wantedScale = Number(els.scaleSelect.value);
    const safeScale = getSafeScale(img.naturalWidth, img.naturalHeight, wantedScale);
    const upscaled = drawUpscaled(img, safeScale);
    setProgress(48);
    await nextFrame();

    const ctx = upscaled.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, upscaled.width, upscaled.height);
    setProgress(64);
    await nextFrame();

    const enhanced = enhanceImageData(imageData, {
      sharpness: els.sharpness.value,
      brightness: els.brightness.value,
      contrast: els.contrast.value,
      saturation: els.saturation.value,
    });

    ctx.putImageData(enhanced, 0, 0);
    setProgress(86);
    await nextFrame();

    const outputType = els.formatSelect.value;
    const blob = await canvasToBlob(upscaled, outputType);
    if (!blob) throw new Error("Gagal membuat file hasil.");

    if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
    resultBlob = blob;
    resultBlobUrl = URL.createObjectURL(blob);
    els.afterImg.src = resultBlobUrl;
    els.compareSlider.value = 50;
    updateCompare(50);

    const extension = outputType.split("/")[1].replace("jpeg", "jpg");
    const cleanName = selectedFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
    resultFileName = `${cleanName || "foto"}-hd.${extension}`;

    els.emptyState.hidden = true;
    els.compareBox.hidden = false;
    els.resultActions.hidden = false;
    setProgress(100);
  } catch (error) {
    console.error(error);
    alert(error.message || "Terjadi kesalahan saat memproses foto.");
  } finally {
    setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 360);
  }
}

els.enhanceBtn.addEventListener("click", enhanceSelectedImage);

els.downloadBtn.addEventListener("click", () => {
  if (!resultBlob) return;
  const link = document.createElement("a");
  link.href = resultBlobUrl;
  link.download = resultFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
});

els.resetBtn.addEventListener("click", () => {
  selectedFile = null;
  resultBlob = null;
  revokeUrls();
  els.imageInput.value = "";
  els.fileInfo.textContent = "Belum ada foto dipilih";
  els.enhanceBtn.disabled = true;
  els.emptyState.hidden = false;
  els.compareBox.hidden = true;
  els.resultActions.hidden = true;
  els.beforeImg.removeAttribute("src");
  els.afterImg.removeAttribute("src");
  window.location.hash = "tools";
});

window.addEventListener("beforeunload", revokeUrls);
