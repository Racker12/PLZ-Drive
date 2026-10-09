export class WorldError extends Error {
  constructor(
    message: string,
    public readonly status: number = 503,
  ) {
    super(message);
    this.name = "WorldError";
  }
}
