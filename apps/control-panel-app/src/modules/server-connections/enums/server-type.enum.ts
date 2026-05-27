export enum ServerType {
  BARE_METAL = "BARE_METAL",
  VIRTUAL_MACHINE = "VIRTUAL_MACHINE",
  CONTAINER_HOST = "CONTAINER_HOST",
  /** Control panel host — agent runs locally without SSH onboard. */
  LOCAL = "LOCAL",
}
