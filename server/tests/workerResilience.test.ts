import { pool } from "../db";
import { processPendingJobs } from "../utils/backgroundJobs";

jest.mock("../db", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../utils/taskEvents", () => ({
  taskEvents: {
    publish: jest.fn(),
  },
}));

const mockedQuery = jest.mocked(pool.query);
const emptyResult = {
  command: "UPDATE",
  rowCount: 0,
  oid: 0,
  fields: [],
  rows: [],
};

describe("Background worker database latency recovery", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("survives a delayed database timeout and resumes polling", async () => {
    mockedQuery.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      throw new Error("Simulated database latency timeout");
    });
    mockedQuery
      .mockResolvedValueOnce(emptyResult)
      .mockResolvedValueOnce(emptyResult);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(processPendingJobs()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Background worker error:",
      expect.objectContaining({
        message: "Simulated database latency timeout",
      })
    );

    await expect(processPendingJobs()).resolves.toBeUndefined();
    expect(mockedQuery).toHaveBeenCalledTimes(3);

    consoleError.mockRestore();
  });
});
