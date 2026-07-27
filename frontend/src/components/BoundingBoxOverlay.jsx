import React, { useMemo } from 'react';

/**
 * BoundingBoxOverlay
 *
 * Renders detection bounding boxes on top of an image using absolute positioning.
 * ``detections`` — array of { x1, y1, x2, y2, class_name, confidence }
 * ``imageWidth`` / ``imageHeight`` — natural (unscaled) dimensions of the image.
 *
 * Each box is a semi-transparent filled rectangle with a coloured border and a
 * label badge in the top-left corner.
 */
const CLASS_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

const getColor = (index) => CLASS_COLORS[index % CLASS_COLORS.length];

const BoundingBoxOverlay = ({ detections = [], imageWidth, imageHeight }) => {
  const scaleX = imageWidth > 0 ? 100 / imageWidth : 1;
  const scaleY = imageHeight > 0 ? 100 / imageHeight : 1;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {detections.map((det, i) => {
        const left = det.x1 * scaleX;
        const top = det.y1 * scaleY;
        const w = (det.x2 - det.x1) * scaleX;
        const h = (det.y2 - det.y1) * scaleY;
        const color = getColor(i);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              width: `${w}%`,
              height: `${h}%`,
              border: `2px solid ${color}`,
              borderRadius: 2,
              boxSizing: 'border-box',
            }}
          >
            {/* Label badge */}
            <div
              style={{
                position: 'absolute',
                top: -22,
                left: 0,
                backgroundColor: color,
                color: '#fff',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'monospace',
                padding: '1px 5px',
                borderRadius: 2,
                whiteSpace: 'nowrap',
                lineHeight: '16px',
              }}
            >
              {det.class_name} {(det.confidence * 100).toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BoundingBoxOverlay;
