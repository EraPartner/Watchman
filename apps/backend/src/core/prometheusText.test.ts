import { describe, it, expect } from "vitest";
import { pickPrometheusPrefix, sumPrometheusSamples } from "./prometheusText.js";

describe("sumPrometheusSamples", () => {
  it("skips comments, ignores labels and sums samples per name", () => {
    const text = [
      "# HELP go_memstats_alloc_bytes Bytes allocated.",
      "# TYPE go_memstats_alloc_bytes gauge",
      "go_memstats_alloc_bytes 1.048576e+07",
      'tor_relay_load_socket_total{state="opened"} 3',
      'tor_relay_load_socket_total{state="closed"} 4 1700000000000',
      'label_with_space{a="x y"} 2',
      "",
    ].join("\n");
    const samples = sumPrometheusSamples(text);
    expect(samples.get("go_memstats_alloc_bytes")).toBe(10_485_760);
    expect(samples.get("tor_relay_load_socket_total")).toBe(7);
    expect(samples.get("label_with_space")).toBe(2);
  });

  it("skips non-numeric and malformed lines instead of throwing", () => {
    const samples = sumPrometheusSamples("good 1\nbad NaNx\n{broken 3\nInf_ok +Inf");
    expect(samples.get("good")).toBe(1);
    expect(samples.has("bad")).toBe(false);
    expect(samples.has("Inf_ok")).toBe(false);
  });
});

describe("pickPrometheusPrefix", () => {
  it("returns only names with the prefix", () => {
    const samples = new Map([
      ["tor_relay_load_oom_bytes_total", 5],
      ["tor_relay_connections", 9],
      ["process_cpu_seconds_total", 1],
    ]);
    expect(pickPrometheusPrefix(samples, "tor_relay_load_")).toEqual({
      tor_relay_load_oom_bytes_total: 5,
    });
  });
});
