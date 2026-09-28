"use client";

import { useState, useRef, useCallback } from "react";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Modal, Button } from "antd";

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop(
      { unit: "%", width: 90 },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

function getCroppedBlob(
  image: HTMLImageElement,
  crop: PixelCrop
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = Math.floor(crop.width * scaleX);
  canvas.height = Math.floor(crop.height * scaleY);

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });
}

type AvatarCropModalProps = {
  open: boolean;
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void>;
};

export default function AvatarCropModal({
  open,
  imageSrc,
  onCancel,
  onConfirm,
}: AvatarCropModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [confirming, setConfirming] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  const handleConfirm = async () => {
    if (!completedCrop?.width || !completedCrop?.height || !imgRef.current) {
      return;
    }
    setConfirming(true);
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop);
      if (blob) {
        const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
        await onConfirm(file);
        onCancel();
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal
      title="Crop Profile Photo"
      open={open}
      onCancel={onCancel}
      width={480}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="confirm"
          type="primary"
          loading={confirming}
          disabled={!completedCrop?.width || !completedCrop?.height}
          onClick={handleConfirm}
        >
          Save Photo
        </Button>,
      ]}
      destroyOnClose
      styles={{ body: { maxHeight: "70vh", overflow: "auto" } }}
    >
      <div style={{ display: "flex", justifyContent: "center", minHeight: 280 }}>
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
          aspect={1}
          circularCrop
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop"
            style={{ maxHeight: "60vh", width: "auto", display: "block" }}
            onLoad={onImageLoad}
          />
        </ReactCrop>
      </div>
    </Modal>
  );
}
