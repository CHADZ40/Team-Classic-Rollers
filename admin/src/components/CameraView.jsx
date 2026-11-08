// The live picture with a box drawn around each face.
import { forwardRef } from "react";

const CameraView = forwardRef(function CameraView({ mirrored, boxes = [], frame, children }, ref) {
  const place = ([x, y, width, height]) => {
    const left = (x / frame.width) * 100;
    const boxWidth = (width / frame.width) * 100;
    return {
      left: `${mirrored ? 100 - left - boxWidth : left}%`,
      top: `${(y / frame.height) * 100}%`,
      width: `${boxWidth}%`,
      height: `${(height / frame.height) * 100}%`,
    };
  };
  return (
    <div className="camera">
      <video ref={ref} className={mirrored ? "is-mirrored" : undefined} playsInline muted aria-label="Camera preview" />
      {frame && boxes.map((item, i) => (
        <div key={i} className={`face-box is-${item.tone}`} style={place(item.box)}>
          {item.label && <span>{item.label}</span>}
        </div>
      ))}
      {children}
    </div>
  );
});

export default CameraView;
