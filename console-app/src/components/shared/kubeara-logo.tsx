import blackLogo from "../../../assets/Logo_black.webp";
import whiteLogo from "../../../assets/Logo_white.webp";

type KubearaLogoProps = {
  className?: string;
};

export function KubearaLogo({ className }: KubearaLogoProps) {
  return (
    <span
      className={className ? `kubeara-logo ${className}` : "kubeara-logo"}
      role="img"
      aria-label="Kubeara"
    >
      <img
        src={blackLogo}
        alt=""
        className="kubeara-logo-image kubeara-logo-image--light"
      />
      <img
        src={whiteLogo}
        alt=""
        className="kubeara-logo-image kubeara-logo-image--dark"
      />
    </span>
  );
}
