import {Minimize2, X, ZoomIn} from 'lucide-react';
import React, {useEffect, useState} from 'react';

export interface LightboxImageState {
  src: string;
  alt: string;
  caption?: string;
}

interface ImageLightboxProps {
  image: LightboxImageState | null;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({image, onClose}) => {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setZoomed(false);
  }, [image?.src]);

  useEffect(() => {
    if (!image) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [image, onClose]);

  if (!image) return null;

  const captionText = image.caption || image.alt;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={captionText ? `Image preview: ${captionText}` : 'Image preview'}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col select-none"
    >
      {/* Top Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-12 px-4 sm:px-6 flex items-center justify-between gap-4 border-b border-white/10 bg-black/40 text-white shrink-0"
      >
        <div className="min-w-0 flex-1 text-xs text-white/80 truncate">
          {captionText || 'Illustration'}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            title={zoomed ? 'Fit to screen' : 'Zoom in'}
            aria-label={zoomed ? 'Fit image to screen' : 'Zoom in on image'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            {zoomed ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Fit</span>
              </>
            ) : (
              <>
                <ZoomIn className="w-3.5 h-3.5" />
                <span>Zoom</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close image preview"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-white/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </div>

      {/* Stage */}
      <div
        className={`flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8 ${
          zoomed ? 'overflow-auto items-start justify-start' : 'overflow-hidden'
        }`}
      >
        <img
          src={image.src}
          alt={image.alt || ''}
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((z) => !z);
          }}
          className={`rounded-md shadow-2xl transition-transform duration-200 ${
            zoomed
              ? 'max-w-none w-auto h-auto scale-125 origin-center m-auto cursor-zoom-out'
              : 'max-w-full max-h-full object-contain cursor-zoom-in'
          }`}
        />
      </div>

      {/* Caption Bar */}
      {captionText && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="px-6 py-3 text-center border-t border-white/10 bg-black/40 text-xs text-white/80 max-h-24 overflow-y-auto shrink-0"
        >
          <p className="max-w-2xl mx-auto font-serif-editorial leading-relaxed">{captionText}</p>
        </div>
      )}
    </div>
  );
};
