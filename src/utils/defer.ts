export class DeferredPromise<T> implements Promise<T> {
    public [Symbol.toStringTag]: 'Promise';

    public then: any;
    public catch: any;
    public resolve: (value: T | PromiseLike<T>) => void;
    public reject: (reason?: any) => void;
    public finally: (onfinally?: (() => void) | undefined | null) => Promise<T>;
    private promiseInternal: Promise<T>;

    constructor() {
        this.promiseInternal = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this.then = this.promiseInternal.then.bind(this.promiseInternal);
        this.catch = this.promiseInternal.catch.bind(this.promiseInternal);
        this.finally = this.promiseInternal.finally.bind(this.promiseInternal);
    }

    public get promise(): Promise<T> {
        return this.promiseInternal;
    }
}

// export interface DeferredPromise<T> {
//     promise: Promise<T>;

//     resolve(this: void, value?: T | PromiseLike<T>): void;
//     reject(this: void, reason?: unknown): void;
// }

// export function createDeferred<T>(): DeferredPromise<T> {
//     const deferred = {} as DeferredPromise<T>;

//     deferred.promise = new Promise<T>((resolve, reject) => {
//         deferred.resolve = resolve;
//         deferred.reject = reject;
//     });

//     return deferred;
// };
