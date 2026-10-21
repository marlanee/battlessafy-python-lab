"""Browser worker grading harness. This is a learning checker, not a secure judge."""
import ast
import contextlib
import copy
import io
import json
import traceback


class LimitedOutput(io.StringIO):
    def write(self, text):
        remaining = max(0, 6000 - self.tell())
        super().write(text[:remaining])
        return len(text)


def grade_submission(payload):
    if payload.get("mode") == "stage":
        from simulation import grade_stages
        return grade_stages(payload)
    namespace = {"__name__": "__student__"}
    output = LimitedOutput()
    results = []
    with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
        try:
            exec(compile(payload["code"], "solution.py", "exec"), namespace)
        except BaseException:
            return json.dumps({"error": traceback.format_exc(limit=5), "stdout": output.getvalue(), "results": []}, ensure_ascii=False)
        for test in payload["tests"]:
            try:
                expression = ast.parse(test["call"], mode="eval").body
                args = [ast.literal_eval(arg) for arg in expression.args]
                before = copy.deepcopy(args)
                function = namespace.get(expression.func.id)
                if not callable(function):
                    raise NameError(f"{expression.func.id} 함수를 정의하세요.")
                actual = function(*args)
                expected = ast.literal_eval(test["expected"])
                same_input = args == before
                passed = actual == expected and same_input
                results.append({"name": test["name"], "passed": bool(passed), "actual": repr(actual)[:2500], "expected": test["expected"], "call": test["call"], "error": "입력 데이터가 수정되었습니다. 원본을 유지하세요." if not same_input else ""})
            except BaseException:
                results.append({"name": test["name"], "passed": False, "actual": "", "expected": test["expected"], "call": test["call"], "error": traceback.format_exc(limit=4)})
    return json.dumps({"results": results, "stdout": output.getvalue()}, ensure_ascii=False)


grade_submission(json.loads(_submission_json))
