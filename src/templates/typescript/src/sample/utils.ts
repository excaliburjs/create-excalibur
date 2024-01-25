export class Subject {
  value: any;
  subscribers = new Set();

  current() {
    return this.value;
  }
  next(newValue: any) {
    this.value = newValue;
    this.subscribers.forEach((cb: any) => cb(this.value));
  }
  onChange(callback: any) {
    this.subscribers.add(callback);

    const unsubscribe = () => {
      this.subscribers.delete(callback);
    };

    return { unsubscribe };
  }
}
export class BehaviourSubject {
  value: any;
  subscribers = new Set();

  constructor(initialValue: any) {
    this.value = initialValue;
  }

  current() {
    return this.value;
  }
  next(newValue: any) {
    const prev = this.value;
    this.value = newValue;
    this.subscribers.forEach((cb: any) => cb(this.value, prev));
  }
  onChange(callback: any) {
    this.subscribers.add(callback);
    callback(this.value);
    const unsubscribe = () => {
      this.subscribers.delete(callback);
    };

    return { unsubscribe };
  }
}
