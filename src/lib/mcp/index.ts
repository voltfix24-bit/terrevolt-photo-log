import { defineMcp } from "@lovable.dev/mcp-js";
import listStations from "./tools/list-stations";
import getStation from "./tools/get-station";

export default defineMcp({
  name: "to-foto-s",
  title: "TO Foto's",
  version: "0.1.0",
  instructions:
    "Read-only access to TO Foto's photo registrations for technical stations. Use `list_stations` to find stations, then `get_station` for photos, NVT tasks and notes.",
  tools: [listStations, getStation],
});
