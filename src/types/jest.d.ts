declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void | Promise<void>) => void;
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const expect: any;
declare const jest: {
  fn: (...args: any[]) => any;
  mock: (...args: any[]) => any;
};
declare namespace jest {
  interface Mock {
    (...args: any[]): any;
    mockReset: () => void;
    mockResolvedValue: (value: any) => void;
  }
}
