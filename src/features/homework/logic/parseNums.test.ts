import { describe, expect, it } from "vitest";
import { parseNums } from "./parseNums";

const valid = [1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 13];

describe("parseNums", () => {
  it("解析逗號分隔", () => expect(parseNums("1,2,3,4", valid)).toEqual([1, 2, 3, 4]));
  it("解析範圍並略過空號 5、7", () => expect(parseNums("1-4,6,8-12", valid)).toEqual([1, 2, 3, 4, 6, 8, 9, 10, 11, 12]));
  it("接受全形逗號、頓號、空白", () => expect(parseNums("1，2、3 4", valid)).toEqual([1, 2, 3, 4]));
  it("反向範圍", () => expect(parseNums("4-1", valid)).toEqual([1, 2, 3, 4]));
  it("忽略不存在與非數字", () => expect(parseNums("5,7,99,abc", valid)).toEqual([]));
  it("去重複", () => expect(parseNums("1,1,1-2", valid)).toEqual([1, 2]));
});
