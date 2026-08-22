/** Map OSM amenity/cuisine tags to MoneyLab food tags. */
export function tagsFromOsm(tags: Record<string, string>): string[] {
  const out = new Set<string>();
  const amenity = tags.amenity?.toLowerCase() ?? "";
  const cuisine = (tags.cuisine ?? "").toLowerCase();

  if (amenity === "cafe" || cuisine.includes("coffee") || cuisine.includes("tea")) {
    out.add("tea");
  }
  if (amenity === "fast_food") {
    out.add("under-35k");
  }
  if (cuisine.includes("noodle") || cuisine.includes("pho") || cuisine.includes("bun") || cuisine.includes("mi")) {
    out.add("noodles");
  }
  if (cuisine.includes("rice") || cuisine.includes("com") || cuisine.includes("cơm")) {
    out.add("rice");
  }
  if (tags.school === "canteen" || tags.amenity === "food_court" || /căng tin|can tin|canteen/i.test(tags.name ?? "")) {
    out.add("canteen");
  }
  if (out.size === 0 && amenity === "restaurant") {
    out.add("rice");
  }
  return [...out];
}

export function noteFromOsm(tags: Record<string, string>): string {
  const bits: string[] = [];
  if (tags.cuisine) bits.push(`Loại món: ${tags.cuisine}`);
  if (tags.opening_hours) bits.push(`Giờ mở: ${tags.opening_hours}`);
  if (tags.phone) bits.push(tags.phone);
  const base = bits.join(" · ");
  return base ? `${base} · Nguồn: OpenStreetMap` : "Nguồn: OpenStreetMap — giá cần xác minh từ cộng đồng.";
}
