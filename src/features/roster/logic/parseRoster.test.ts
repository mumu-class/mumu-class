import { describe, expect, it } from "vitest";
import { parseRoster } from "./parseRoster";

describe("parseRoster", () => {
  it("解析座號、中文名、英文名", () => {
    expect(parseRoster("1 王小明 Ming\n2\t李小華\tHua").rows).toEqual([
      { student_no: 1, name_zh: "王小明", name_en: "Ming" },
      { student_no: 2, name_zh: "李小華", name_en: "Hua" },
    ]);
  });
  it("英文名可含空白、可省略", () => {
    expect(parseRoster("9 楊小羽 Si Yu\n10 陳小萌").rows).toEqual([
      { student_no: 9, name_zh: "楊小羽", name_en: "Si Yu" },
      { student_no: 10, name_zh: "陳小萌", name_en: null },
    ]);
  });
  it("接受｜和逗號分隔，略過空行", () => {
    expect(parseRoster("3｜張小晴｜Lilian\n\n4,蔡小均,Cynthia").rows.map((r) => r.student_no)).toEqual([3, 4]);
  });
  it("回報無法解析的行號", () => {
    expect(parseRoster("1 王小明\n沒有座號\n2 李小華").errors).toEqual([2]);
  });
});
