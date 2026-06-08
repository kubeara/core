import blueLogo from "../../../assets/Kubeara_full_blue_logo.webp";
import whiteLogo from "../../../assets/Kubeara_full_white_logo.webp";

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
        src={blueLogo}
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
