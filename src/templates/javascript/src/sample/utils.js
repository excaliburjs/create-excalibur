export class Subject {
  constructor() {
    this.value = null;
    this.subscribers = new Set();
  }
  current() {
    return this.value;
  }
  next(newValue) {
    this.value = newValue;
    this.subscribers.forEach((cb) => cb(this.value));
  }
  onChange(callback) {
    this.subscribers.add(callback);

    const unsubscribe = () => {
      this.subscribers.delete(callback);
    };

    return { unsubscribe };
  }
}
export class BehaviourSubject {
  constructor(initialValue) {
    this.value = initialValue;
    this.subscribers = new Set();
  }

  current() {
    return this.value;
  }
  next(newValue) {
    const prev = this.value;
    this.value = newValue;
    this.subscribers.forEach((cb) => cb(this.value, prev));
  }
  onChange(callback) {
    this.subscribers.add(callback);
    callback(this.value);
    const unsubscribe = () => {
      this.subscribers.delete(callback);
    };

    return { unsubscribe };
  }
}
