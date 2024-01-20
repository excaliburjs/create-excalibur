export class Subject {
  constructor() {
    this.value = null;
    this.subscribers = new Set();
  }
  current() {
    return this.value;
  }
  next(new_value) {
    this.value = new_value;
    this.subscribers.forEach((cb) => cb(this.value));
  }
  subscribe(callback) {
    this.subscribers.add(callback);

    const unsubscribe = () => {
      this.subscribers.delete(callback);
    };

    return { unsubscribe };
  }
}
export class BehaviourSubject {
  constructor(initial_value) {
    this.value = initial_value;
    this.subscribers = new Set();
  }

  current() {
    return this.value;
  }
  next(new_value) {
    const prev = this.value;
    this.value = new_value;
    this.subscribers.forEach((cb) => cb(this.value, prev));
  }
  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.value);
    const unsubscribe = () => {
      this.subscribers.delete(callback);
    };

    return { unsubscribe };
  }
}
