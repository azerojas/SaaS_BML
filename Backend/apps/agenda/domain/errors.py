class AgendaError(Exception):
    def __init__(self,code,detail,kind='conflict'):
        self.code,self.detail,self.kind=code,detail,kind
