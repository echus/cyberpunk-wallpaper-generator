// Seeded random numbers.
// The same seed always gives the same numbers, so the same seed always gives the same wallpaper.
// The generator is "mulberry32": small, fast and good enough for pictures.

export class Random {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  // A number from 0 (included) to 1 (not included).
  random() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // A number from a to b.
  uniform(a, b) {
    return a + (b - a) * this.random();
  }

  // A whole number from a to b. Both a and b can come up.
  int(a, b) {
    return a + Math.floor(this.random() * (b - a + 1));
  }

  // A whole number from 0 to n - 1.
  index(n) {
    return Math.floor(this.random() * n);
  }

  // One item from a list.
  pick(list) {
    return list[this.index(list.length)];
  }

  // One item from a list. An item with a larger weight comes up more often.
  weighted(list, weights) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let r = this.random() * total;
    for (let i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r < 0) return list[i];
    }
    return list[list.length - 1];
  }

  // k different items from a list. The list does not change.
  sample(list, k) {
    return this.shuffle([...list]).slice(0, k);
  }

  // Puts the items of a list in a random order. This changes the list.
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.index(i + 1);
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // A random count that is near the given average (a Poisson distribution).
  poisson(mean) {
    const limit = Math.exp(-mean);
    let count = 0;
    let p = this.random();
    while (p > limit) {
      count++;
      p *= this.random();
    }
    return count;
  }
}
