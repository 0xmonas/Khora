'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Layer, ToolType, Rect } from '@/lib/pixel-forge/types';

interface PixelEditorProps {
  layers: Layer[];
  activeLayerId: string;
  activeTool: ToolType;
  primaryColor: string;
  brushSize: number;
  zoom: number;
  bgOpacity: number;
  showGrid: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onUpdateLayer: (id: string, newData: string) => void;
  onPickColor: (color: string) => void;
  selection: Rect | null;
  setSelection: (rect: Rect | null) => void;
}

export function PixelEditor({
  layers, activeLayerId, activeTool, primaryColor, brushSize,
  zoom, bgOpacity, showGrid, canvasWidth, canvasHeight, onUpdateLayer, onPickColor, selection, setSelection,
}: PixelEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const autoZoom = containerSize
    ? Math.max(1, Math.floor(Math.min(
        (containerSize.w - 32) / canvasWidth,
        (containerSize.h - 32) / canvasHeight,
      )))
    : zoom;
  const pixelSize = Math.min(zoom, autoZoom);

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [layerPixels, setLayerPixels] = useState<Map<string, ImageData>>(new Map());

  const isDrawingRef = useRef(false);
  const lastPixelRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const scratchRef = useRef<ImageData | null>(null);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [shapePreview, setShapePreview] = useState<{ x: number; y: number } | null>(null);
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);
  const moveBufferRef = useRef<ImageData | null>(null);
  const moveOrigSelRef = useRef<Rect | null>(null);

  useEffect(() => {
    const loadLayers = async () => {
      const newLayerPixels = new Map<string, ImageData>();
      for (const layer of layers) {
        if (layer.data) {
          const img = new Image();
          img.src = layer.data;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const cvs = document.createElement('canvas');
              cvs.width = canvasWidth; cvs.height = canvasHeight;
              const ctx = cvs.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.imageSmoothingEnabled = false;
                ctx.clearRect(0, 0, canvasWidth, canvasHeight);
                if (img.naturalWidth > canvasWidth || img.naturalHeight > canvasHeight) {
                  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
                } else {
                  ctx.drawImage(img, 0, 0);
                }
                newLayerPixels.set(layer.id, ctx.getImageData(0, 0, canvasWidth, canvasHeight));
              }
              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      }
      setLayerPixels(newLayerPixels);
    };
    loadLayers();
  }, [layers, canvasWidth, canvasHeight]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = bgOpacity;
    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1a1a1a' : '#2a2a2a';
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
      }
    }
    ctx.globalAlpha = 1.0;

    [...layers].reverse().forEach(layer => {
      if (!layer.visible) return;
      const imageData = (isDrawingRef.current && layer.id === activeLayerId && scratchRef.current)
        ? scratchRef.current
        : layerPixels.get(layer.id);
      if (!imageData) return;
      ctx.globalAlpha = layer.opacity;
      const data = imageData.data;
      for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
          const idx = (y * canvasWidth + x) * 4;
          const a = data[idx + 3];
          if (a > 0) {
            ctx.fillStyle = `rgba(${data[idx]},${data[idx + 1]},${data[idx + 2]},${a / 255})`;
            ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
          }
        }
      }
      ctx.globalAlpha = 1.0;
    });

    if (moveBufferRef.current && selection) {
      const buf = moveBufferRef.current;
      for (let sy = 0; sy < buf.height; sy++) {
        for (let sx = 0; sx < buf.width; sx++) {
          const idx = (sy * buf.width + sx) * 4;
          const a = buf.data[idx + 3];
          if (a > 0) {
            ctx.fillStyle = `rgba(${buf.data[idx]},${buf.data[idx + 1]},${buf.data[idx + 2]},${a / 255})`;
            ctx.fillRect((selection.x + sx) * pixelSize, (selection.y + sy) * pixelSize, pixelSize, pixelSize);
          }
        }
      }
    }

    if (selection) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(selection.x * pixelSize, selection.y * pixelSize, selection.w * pixelSize, selection.h * pixelSize);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(selection.x * pixelSize, selection.y * pixelSize, selection.w * pixelSize, selection.h * pixelSize);
      ctx.setLineDash([]);
    }

    if (showGrid && pixelSize >= 4) {
      ctx.save();
      ctx.strokeStyle = pixelSize >= 8 ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = pixelSize >= 8 ? 0.5 : 0.3;
      ctx.beginPath();
      const maxDim = Math.max(canvasWidth, canvasHeight);
      for (let i = 1; i < maxDim; i++) {
        const p = i * pixelSize;
        if (i < canvasWidth) { ctx.moveTo(p, 0); ctx.lineTo(p, canvasHeight * pixelSize); }
        if (i < canvasHeight) { ctx.moveTo(0, p); ctx.lineTo(canvasWidth * pixelSize, p); }
      }
      ctx.stroke();
      ctx.restore();
    }

    if (shapePreview && shapeStartRef.current && (activeTool === ToolType.LINE || activeTool === ToolType.RECTANGLE || activeTool === ToolType.CIRCLE)) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      const sp = shapeStartRef.current;
      if (activeTool === ToolType.LINE) {
        ctx.beginPath();
        ctx.moveTo(sp.x * pixelSize + pixelSize / 2, sp.y * pixelSize + pixelSize / 2);
        ctx.lineTo(shapePreview.x * pixelSize + pixelSize / 2, shapePreview.y * pixelSize + pixelSize / 2);
        ctx.stroke();
      } else if (activeTool === ToolType.RECTANGLE) {
        const x1 = Math.min(sp.x, shapePreview.x) * pixelSize;
        const y1 = Math.min(sp.y, shapePreview.y) * pixelSize;
        const w = (Math.abs(shapePreview.x - sp.x) + 1) * pixelSize;
        const h = (Math.abs(shapePreview.y - sp.y) + 1) * pixelSize;
        ctx.strokeRect(x1, y1, w, h);
      } else if (activeTool === ToolType.CIRCLE) {
        const r = Math.round(Math.sqrt(Math.pow(shapePreview.x - sp.x, 2) + Math.pow(shapePreview.y - sp.y, 2))) * pixelSize;
        ctx.beginPath();
        ctx.arc(sp.x * pixelSize + pixelSize / 2, sp.y * pixelSize + pixelSize / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [layers, layerPixels, activeLayerId, selection, pixelSize, bgOpacity, showGrid, activeTool, shapePreview, canvasWidth, canvasHeight]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  const getPixelCoordinates = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / pixelSize);
    const y = Math.floor((event.clientY - rect.top) / pixelSize);
    if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) return { x, y };
    return null;
  }, [pixelSize, canvasWidth, canvasHeight]);

  const replaceColor = useCallback((startX: number, startY: number, fillColor: string) => {
    const imageData = layerPixels.get(activeLayerId);
    if (!imageData) return;
    const data = imageData.data;

    const isTransparent = fillColor === 'transparent';
    const fillR = isTransparent ? 0 : parseInt(fillColor.slice(1, 3), 16);
    const fillG = isTransparent ? 0 : parseInt(fillColor.slice(3, 5), 16);
    const fillB = isTransparent ? 0 : parseInt(fillColor.slice(5, 7), 16);
    const fillA = isTransparent ? 0 : 255;

    const startIdx = (startY * canvasWidth + startX) * 4;
    const targetR = data[startIdx], targetG = data[startIdx + 1], targetB = data[startIdx + 2], targetA = data[startIdx + 3];
    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

    const newData = new Uint8ClampedArray(data);
    for (let y = 0; y < canvasHeight; y++) {
      for (let x = 0; x < canvasWidth; x++) {
        if (selection && (x < selection.x || x >= selection.x + selection.w || y < selection.y || y >= selection.y + selection.h)) continue;
        const idx = (y * canvasWidth + x) * 4;
        if (newData[idx] === targetR && newData[idx + 1] === targetG && newData[idx + 2] === targetB && newData[idx + 3] === targetA) {
          newData[idx] = fillR; newData[idx + 1] = fillG; newData[idx + 2] = fillB; newData[idx + 3] = fillA;
        }
      }
    }

    const updated = new ImageData(newData, canvasWidth, canvasHeight);
    setLayerPixels(prev => { const next = new Map(prev); next.set(activeLayerId, updated); return next; });
    const tmp = document.createElement('canvas');
    tmp.width = canvasWidth; tmp.height = canvasHeight;
    const tmpCtx = tmp.getContext('2d');
    if (tmpCtx) { tmpCtx.putImageData(updated, 0, 0); onUpdateLayer(activeLayerId, tmp.toDataURL('image/png')); }
  }, [activeLayerId, layerPixels, selection, onUpdateLayer, canvasWidth, canvasHeight]);

  const floodFill = useCallback((startX: number, startY: number, fillColor: string) => {
    const imageData = layerPixels.get(activeLayerId);
    if (!imageData) return;
    const data = imageData.data;

    const isTransparent = fillColor === 'transparent';
    const fillR = isTransparent ? 0 : parseInt(fillColor.slice(1, 3), 16);
    const fillG = isTransparent ? 0 : parseInt(fillColor.slice(3, 5), 16);
    const fillB = isTransparent ? 0 : parseInt(fillColor.slice(5, 7), 16);
    const fillA = isTransparent ? 0 : 255;

    const startIdx = (startY * canvasWidth + startX) * 4;
    const targetR = data[startIdx], targetG = data[startIdx + 1], targetB = data[startIdx + 2], targetA = data[startIdx + 3];
    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

    const stack = [[startX, startY]];
    const visited = new Set<string>();
    const newData = new Uint8ClampedArray(data);

    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cx >= canvasWidth || cy < 0 || cy >= canvasHeight) continue;
      if (selection && (cx < selection.x || cx >= selection.x + selection.w || cy < selection.y || cy >= selection.y + selection.h)) continue;
      const key = `${cx},${cy}`;
      if (visited.has(key)) continue;
      const idx = (cy * canvasWidth + cx) * 4;
      if (newData[idx] === targetR && newData[idx + 1] === targetG && newData[idx + 2] === targetB && newData[idx + 3] === targetA) {
        newData[idx] = fillR; newData[idx + 1] = fillG; newData[idx + 2] = fillB; newData[idx + 3] = fillA;
        visited.add(key);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    }

    const updated = new ImageData(newData, canvasWidth, canvasHeight);
    setLayerPixels(prev => { const next = new Map(prev); next.set(activeLayerId, updated); return next; });
    const tmp = document.createElement('canvas');
    tmp.width = canvasWidth; tmp.height = canvasHeight;
    const tmpCtx = tmp.getContext('2d');
    if (tmpCtx) { tmpCtx.putImageData(updated, 0, 0); onUpdateLayer(activeLayerId, tmp.toDataURL('image/png')); }
  }, [activeLayerId, layerPixels, selection, onUpdateLayer, canvasWidth, canvasHeight]);

  const stampPixel = (scratch: ImageData, x: number, y: number, toolType: ToolType, color: string) => {
    const data = scratch.data;
    const halfSize = Math.floor(brushSize / 2);
    const isEven = brushSize % 2 === 0;
    const sx = isEven ? x : x - halfSize;
    const ex = isEven ? x + brushSize - 1 : x + halfSize;
    const sy = isEven ? y : y - halfSize;
    const ey = isEven ? y + brushSize - 1 : y + halfSize;

    const isTransparent = color === 'transparent';
    const r = isTransparent ? 0 : parseInt(color.slice(1, 3), 16);
    const g = isTransparent ? 0 : parseInt(color.slice(3, 5), 16);
    const b = isTransparent ? 0 : parseInt(color.slice(5, 7), 16);

    for (let py = sy; py <= ey; py++) {
      for (let px = sx; px <= ex; px++) {
        if (px < 0 || px >= canvasWidth || py < 0 || py >= canvasHeight) continue;
        if (selection && (px < selection.x || px >= selection.x + selection.w || py < selection.y || py >= selection.y + selection.h)) continue;
        const idx = (py * canvasWidth + px) * 4;
        if (toolType === ToolType.PENCIL) {
          if (isTransparent) {
            data[idx + 3] = 0;
          } else {
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
          }
        } else if (toolType === ToolType.ERASER) {
          data[idx + 3] = 0;
        }
      }
    }
  };

  const stampLine = (scratch: ImageData, x0: number, y0: number, x1: number, y1: number, toolType: ToolType, color: string) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0, cy = y0;
    while (true) {
      stampPixel(scratch, cx, cy, toolType, color);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  };

  const stampRect = (scratch: ImageData, x1: number, y1: number, x2: number, y2: number, color: string) => {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x === minX || x === maxX || y === minY || y === maxY) {
          stampPixel(scratch, x, y, ToolType.PENCIL, color);
        }
      }
    }
  };

  const stampCircle = (scratch: ImageData, cx: number, cy: number, ex: number, ey: number, color: string) => {
    const radius = Math.round(Math.sqrt(Math.pow(ex - cx, 2) + Math.pow(ey - cy, 2)));
    const plot = (px: number, py: number) => stampPixel(scratch, px, py, ToolType.PENCIL, color);
    const sym = (x: number, y: number) => {
      plot(cx + x, cy + y); plot(cx - x, cy + y);
      plot(cx + x, cy - y); plot(cx - x, cy - y);
      plot(cx + y, cy + x); plot(cx - y, cy + x);
      plot(cx + y, cy - x); plot(cx - y, cy - x);
    };
    let x = 0, y = radius, d = 3 - 2 * radius;
    sym(x, y);
    while (y >= x) {
      x++;
      if (d > 0) { y--; d += 4 * (x - y) + 10; } else { d += 4 * x + 6; }
      sym(x, y);
    }
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getPixelCoordinates(event);
    if (!coords) return;

    if (activeTool === ToolType.MOVE) {
      if (selection && coords.x >= selection.x && coords.x < selection.x + selection.w && coords.y >= selection.y && coords.y < selection.y + selection.h) {
        const existing = layerPixels.get(activeLayerId);
        if (existing) {
          const buf = new ImageData(selection.w, selection.h);
          const scratch = new ImageData(new Uint8ClampedArray(existing.data), canvasWidth, canvasHeight);
          for (let sy = 0; sy < selection.h; sy++) {
            for (let sx = 0; sx < selection.w; sx++) {
              const srcIdx = ((selection.y + sy) * canvasWidth + (selection.x + sx)) * 4;
              const dstIdx = (sy * selection.w + sx) * 4;
              buf.data[dstIdx] = existing.data[srcIdx];
              buf.data[dstIdx + 1] = existing.data[srcIdx + 1];
              buf.data[dstIdx + 2] = existing.data[srcIdx + 2];
              buf.data[dstIdx + 3] = existing.data[srcIdx + 3];
              scratch.data[srcIdx + 3] = 0;
            }
          }
          moveBufferRef.current = buf;
          moveOrigSelRef.current = { ...selection };
          scratchRef.current = scratch;
          isDrawingRef.current = true;
          moveStartRef.current = coords;
          drawCanvas();
        }
      } else {
        setIsPanning(true); setPanStart({ x: event.clientX, y: event.clientY });
      }
    } else if (activeTool === ToolType.SELECT) {
      setSelection({ x: coords.x, y: coords.y, w: 1, h: 1 });
      dragStartRef.current = coords;
    } else if (activeTool === ToolType.EYEDROPPER) {
      const imageData = layerPixels.get(activeLayerId);
      if (imageData) {
        const idx = (coords.y * canvasWidth + coords.x) * 4;
        if (imageData.data[idx + 3] > 0) {
          onPickColor('#' + ((1 << 24) + (imageData.data[idx] << 16) + (imageData.data[idx + 1] << 8) + imageData.data[idx + 2]).toString(16).slice(1));
        }
      }
    } else if (activeTool === ToolType.FILL) {
      floodFill(coords.x, coords.y, primaryColor);
    } else if (activeTool === ToolType.FILL_SAME) {
      replaceColor(coords.x, coords.y, primaryColor);
    } else if (activeTool === ToolType.LINE || activeTool === ToolType.RECTANGLE || activeTool === ToolType.CIRCLE) {
      shapeStartRef.current = coords;
      setShapePreview(coords);
    } else if (activeTool === ToolType.PENCIL || activeTool === ToolType.ERASER) {
      const existing = layerPixels.get(activeLayerId);
      const scratch = existing
        ? new ImageData(new Uint8ClampedArray(existing.data), canvasWidth, canvasHeight)
        : new ImageData(canvasWidth, canvasHeight);
      scratchRef.current = scratch;
      isDrawingRef.current = true;
      lastPixelRef.current = coords;
      stampPixel(scratch, coords.x, coords.y, activeTool, primaryColor);
      drawCanvas();
    }
    setMousePos(coords);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getPixelCoordinates(event);
    if (!coords) return;
    setMousePos(coords);

    if (activeTool === ToolType.MOVE && moveStartRef.current && moveBufferRef.current && scratchRef.current && moveOrigSelRef.current) {
      const dx = coords.x - moveStartRef.current.x;
      const dy = coords.y - moveStartRef.current.y;
      const origSel = moveOrigSelRef.current;
      setSelection({ x: origSel.x + dx, y: origSel.y + dy, w: origSel.w, h: origSel.h });
      drawCanvas();
    } else if (isPanning && panStart && activeTool === ToolType.MOVE) {
      setPanOffset({ x: event.clientX - panStart.x, y: event.clientY - panStart.y });
    } else if (isDrawingRef.current && scratchRef.current && (activeTool === ToolType.PENCIL || activeTool === ToolType.ERASER)) {
      const last = lastPixelRef.current;
      if (last && (last.x !== coords.x || last.y !== coords.y)) {
        stampLine(scratchRef.current, last.x, last.y, coords.x, coords.y, activeTool, primaryColor);
        lastPixelRef.current = coords;
        drawCanvas();
      }
    } else if (shapeStartRef.current && (activeTool === ToolType.LINE || activeTool === ToolType.RECTANGLE || activeTool === ToolType.CIRCLE)) {
      setShapePreview(coords);
      drawCanvas();
    } else if (dragStartRef.current && activeTool === ToolType.SELECT) {
      const ds = dragStartRef.current;
      setSelection({ x: Math.min(ds.x, coords.x), y: Math.min(ds.y, coords.y), w: Math.abs(ds.x - coords.x) + 1, h: Math.abs(ds.y - coords.y) + 1 });
    }
  };

  const commitScratch = (scratch: ImageData) => {
    setLayerPixels(prev => { const next = new Map(prev); next.set(activeLayerId, scratch); return next; });
    const tmp = document.createElement('canvas');
    tmp.width = canvasWidth; tmp.height = canvasHeight;
    const tmpCtx = tmp.getContext('2d');
    if (tmpCtx) { tmpCtx.putImageData(scratch, 0, 0); onUpdateLayer(activeLayerId, tmp.toDataURL('image/png')); }
  };

  const handleMouseUp = (event?: React.MouseEvent<HTMLCanvasElement>) => {
    if (moveBufferRef.current && scratchRef.current && selection) {
      const buf = moveBufferRef.current;
      const scratch = scratchRef.current;
      for (let sy = 0; sy < buf.height; sy++) {
        for (let sx = 0; sx < buf.width; sx++) {
          const tx = selection.x + sx;
          const ty = selection.y + sy;
          if (tx < 0 || tx >= canvasWidth || ty < 0 || ty >= canvasHeight) continue;
          const srcIdx = (sy * buf.width + sx) * 4;
          const dstIdx = (ty * canvasWidth + tx) * 4;
          scratch.data[dstIdx] = buf.data[srcIdx];
          scratch.data[dstIdx + 1] = buf.data[srcIdx + 1];
          scratch.data[dstIdx + 2] = buf.data[srcIdx + 2];
          scratch.data[dstIdx + 3] = buf.data[srcIdx + 3];
        }
      }
      commitScratch(scratch);
      moveBufferRef.current = null;
      moveOrigSelRef.current = null;
      moveStartRef.current = null;
      isDrawingRef.current = false;
      scratchRef.current = null;
      return;
    }

    if (isDrawingRef.current && scratchRef.current) {
      commitScratch(scratchRef.current);
    }

    if (shapeStartRef.current && shapePreview && event && (activeTool === ToolType.LINE || activeTool === ToolType.RECTANGLE || activeTool === ToolType.CIRCLE)) {
      const coords = getPixelCoordinates(event);
      if (coords) {
        const existing = layerPixels.get(activeLayerId);
        const scratch = existing
          ? new ImageData(new Uint8ClampedArray(existing.data), canvasWidth, canvasHeight)
          : new ImageData(canvasWidth, canvasHeight);
        const sp = shapeStartRef.current;
        if (activeTool === ToolType.LINE) {
          stampLine(scratch, sp.x, sp.y, coords.x, coords.y, ToolType.PENCIL, primaryColor);
        } else if (activeTool === ToolType.RECTANGLE) {
          stampRect(scratch, sp.x, sp.y, coords.x, coords.y, primaryColor);
        } else if (activeTool === ToolType.CIRCLE) {
          stampCircle(scratch, sp.x, sp.y, coords.x, coords.y, primaryColor);
        }
        commitScratch(scratch);
      }
    }

    isDrawingRef.current = false;
    lastPixelRef.current = null;
    scratchRef.current = null;
    dragStartRef.current = null;
    shapeStartRef.current = null;
    setShapePreview(null);
    if (isPanning) { setIsPanning(false); setPanStart(null); }
  };

  const cursorSize = (activeTool === ToolType.PENCIL || activeTool === ToolType.ERASER) ? brushSize : 1;
  const getCursorPos = () => {
    if (!mousePos) return null;
    const half = Math.floor(cursorSize / 2);
    return cursorSize % 2 === 0 ? { x: mousePos.x, y: mousePos.y } : { x: mousePos.x - half, y: mousePos.y - half };
  };
  const cursorPos = getCursorPos();

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center relative p-4">
      <div
        className="relative outline outline-2 outline-neutral-700 dark:outline-neutral-200"
        style={{
          width: canvasWidth * pixelSize, height: canvasHeight * pixelSize,
          minWidth: canvasWidth * pixelSize, minHeight: canvasHeight * pixelSize,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          transition: isPanning ? 'none' : 'transform 0.1s ease-out',
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasWidth * pixelSize}
          height={canvasHeight * pixelSize}
          style={{ imageRendering: 'pixelated', cursor: activeTool === ToolType.MOVE ? (isPanning ? 'grabbing' : 'grab') : 'crosshair' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => handleMouseUp()}
        />
        {cursorPos && mousePos && activeTool !== ToolType.EYEDROPPER && activeTool !== ToolType.SELECT && activeTool !== ToolType.MOVE && (
          <div
            className="pointer-events-none absolute z-50 border border-neutral-400"
            style={{
              left: cursorPos.x * pixelSize, top: cursorPos.y * pixelSize,
              width: cursorSize * pixelSize, height: cursorSize * pixelSize,
              backgroundColor: activeTool === ToolType.ERASER || primaryColor === 'transparent' ? 'rgba(255,255,255,0.2)' : `${primaryColor}33`,
            }}
          />
        )}
      </div>
      <div className="absolute bottom-4 right-4 border border-neutral-700 dark:border-neutral-600 px-3 py-1.5 text-[10px] text-muted-foreground" style={{ fontFamily: 'var(--font-departure-mono)' }}>
        {mousePos ? `X:${mousePos.x.toString().padStart(2, '0')} Y:${mousePos.y.toString().padStart(2, '0')}` : 'IDLE'} · {canvasWidth}x{canvasHeight} · {Math.round(zoom)}X
      </div>
    </div>
  );
}
