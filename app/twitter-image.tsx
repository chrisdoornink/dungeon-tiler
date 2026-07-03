import { ImageResponse } from "next/og";
import { TorchBoyCard, OG_SIZE } from "./_og/torch-boy-card";

export const alt = "Torch Boy — a new dungeon every day";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(<TorchBoyCard />, { ...OG_SIZE });
}
