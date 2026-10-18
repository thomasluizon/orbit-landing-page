import qrcode from "qrcode-generator";
import { googlePlayUrl } from "../config/links";

export function GET() {
  const code = qrcode(0, "H");
  code.addData(googlePlayUrl);
  code.make();
  return new Response(code.createSvgTag({ cellSize: 4, margin: 16, scalable: true }), {
    headers: { "Content-Type": "image/svg+xml" },
  });
}
