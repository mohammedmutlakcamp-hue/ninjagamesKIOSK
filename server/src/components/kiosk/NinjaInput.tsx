'use client';

import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';

interface NinjaInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
}

export const NinjaInput = forwardRef<HTMLInputElement, NinjaInputProps>(
  ({ icon, className = '', ...props }, ref) => {
    return (
      <div className="ninja-input-wrap">
        <div className="ninja-input-glow"></div>
        <div className="ninja-input-border-bg"></div>
        <div className="ninja-input-border-bg"></div>
        <div className="ninja-input-border-bg"></div>
        <div className="ninja-input-white"></div>
        <div className="ninja-input-border"></div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          {icon && <div className="ninja-input-icon">{icon}</div>}
          <input
            ref={ref}
            className={`ninja-input-field ${icon ? 'has-icon' : ''} ${className}`}
            {...props}
          />
        </div>
      </div>
    );
  }
);

NinjaInput.displayName = 'NinjaInput';
