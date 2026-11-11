class ReportError(Exception):
    def __init__(self, code, detail, kind='invalid'):
        self.code, self.detail, self.kind = code, detail, kind
