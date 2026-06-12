import type { CSSProperties } from "react";
import "./service-brand-icon.css";

type ServiceBrandIconProps = {
  name: string;
  logo?: string | null;
  className?: string;
  style?: CSSProperties;
};

export function ServiceBrandIcon({
  name,
  logo,
  className,
  style,
}: ServiceBrandIconProps) {
  const label = name.trim() || "?";
  const initial = label.charAt(0).toUpperCase();
  const trimmedLogo = logo?.trim();

  return (
    <div className={className} style={style} aria-hidden>
      {trimmedLogo ? (
        <img src={trimmedLogo} alt="" className="service-brand-logo" />
      ) : (
        initial
      )}
    </div>
  );
}
