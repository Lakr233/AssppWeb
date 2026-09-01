// unbzip2-stream ships no types. It is a plain stream factory.
declare module "unbzip2-stream" {
  import { Transform } from "stream";
  export default function unbzip2(): Transform;
}
