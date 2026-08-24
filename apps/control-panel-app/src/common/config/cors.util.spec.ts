// import { buildCorsOptions } from "./cors.util";
// import { ConfigService } from "@nestjs/config";

// describe("buildCorsOptions", () => {
//   let configService: ConfigService;

//   beforeEach(() => {
//     configService = {
//       get: jest.fn((key: string) => {
//         if (key === "CORS_ALLOWED_ORIGINS") {
//           return "http://allowed.com";
//         }
//         if (key === "SERVICE_PORT_KUBEARA_CONSOLE") {
//           return "7935";
//         }
//         return undefined;
//       }),
//     } as unknown as ConfigService;
//   });

//   afterEach(() => {
//     delete process.env.NODE_ENV;
//   });

//   it("allows configured origin", () => {
//     const corsOptions = buildCorsOptions(configService);
//     const callback = jest.fn();

//     const originFn = corsOptions.origin as Function;
//     originFn("http://allowed.com", callback);

//     expect(callback).toHaveBeenCalledWith(null, true);
//   });

//   it("allows matching console port on same hostname", () => {
//     const corsOptions = buildCorsOptions(configService);
//     const callback = jest.fn();

//     const originFn = corsOptions.origin as Function;

//     originFn("http://localhost:7935", callback);
//     expect(callback).toHaveBeenCalledWith(null, true);

//     originFn("http://192.168.1.100:7935", callback);
//     expect(callback).toHaveBeenCalledWith(null, true);
//   });

//   it("rejects non-matching console port on same hostname in production", () => {
//     process.env.NODE_ENV = "production";
//     const corsOptions = buildCorsOptions(configService);
//     const callback = jest.fn();

//     const originFn = corsOptions.origin as Function;

//     originFn("http://localhost:8000", callback);
//     expect(callback).toHaveBeenCalledWith(null, false);
//   });

//   it("rejects undefined/empty origin unless allowed in production", () => {
//     process.env.NODE_ENV = "production";
//     const corsOptions = buildCorsOptions(configService);
//     const callback = jest.fn();

//     const originFn = corsOptions.origin as Function;

//     originFn(undefined, callback);
//     expect(callback).toHaveBeenCalledWith(null, true);
//   });
// });
