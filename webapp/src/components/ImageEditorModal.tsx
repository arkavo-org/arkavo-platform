import React, { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import './ImageEditorModal.css';

interface ImageEditorModalProps {
  image: string;
  onClose: () => void;
  onSave: (croppedImage: string) => void;
}

const ImageEditorModal: React.FC<ImageEditorModalProps> = ({ image, onClose, onSave }) => {
  const [localImage, setLocalImage] = useState(image);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = (croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    try {
      const croppedImage = await getCroppedImg(localImage, croppedAreaPixels, rotation);
      // Extract just the base64 part of the data URL
      const base64Data = croppedImage.split(',')[1];
      onSave(base64Data);
    } catch (err) {
      console.error('Error cropping image:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setLocalImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setLocalImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  return (
    <div className="modal-overlay" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <div className="modal-content">
        <div className="upload-zone">
          <label htmlFor="imageUpload" className="upload-label">
            Click or drag an image here to upload
            <input
              id="imageUpload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        {localImage && (
          <div className="crop-container">
            <Cropper
              image={localImage}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
            />
          </div>
        )}
        <div className="controls">
          <div className="slider-container">
            <label>Zoom</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </div>
          <div className="slider-container">
            <label>Rotation</label>
            <input
              type="range"
              min={0}
              max={360}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
            />
          </div>
          <div className="button-group">
            <button className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="save-btn" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<string> {
  const image = new Image();
  image.src = imageSrc;

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create canvas context');
  }

  const maxSize = Math.max(image.width, image.height);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  canvas.width = safeArea;
  canvas.height = safeArea;
  ctx.clearRect(0, 0, safeArea, safeArea);

  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-safeArea / 2, -safeArea / 2);

  ctx.drawImage(
    image,
    safeArea / 2 - image.width / 2,
    safeArea / 2 - image.height / 2
  );

  const data = ctx.getImageData(0, 0, safeArea, safeArea);

  // Create a canvas to extract the cropped area
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = pixelCrop.width;
  croppedCanvas.height = pixelCrop.height;
  const croppedCtx = croppedCanvas.getContext('2d');

  if (!croppedCtx) {
    throw new Error('Could not create cropped canvas context');
  }

  croppedCtx.clearRect(0, 0, pixelCrop.width, pixelCrop.height);
  croppedCtx.putImageData(
    data,
    Math.round(0 - safeArea / 2 + image.width / 2 - pixelCrop.x),
    Math.round(0 - safeArea / 2 + image.height / 2 - pixelCrop.y)
  );

  // Create final canvas scaled to 512x512
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = 512;
  finalCanvas.height = 512;
  const finalCtx = finalCanvas.getContext('2d');

  if (!finalCtx) {
    throw new Error('Could not create final canvas context');
  }

  finalCtx.clearRect(0, 0, 512, 512);
  finalCtx.drawImage(croppedCanvas, 0, 0, 512, 512);

  return finalCanvas.toDataURL('image/png');
}

export default ImageEditorModal;
