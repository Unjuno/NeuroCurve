"""Independent SciPy PCHIP and PyTorch export/autograd cross-checks."""
import importlib.util,json,subprocess,tempfile,sys
from pathlib import Path
import numpy as np
import torch
from scipy.interpolate import PchipInterpolator
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    subprocess.run(['node','scripts/reference-fixtures.js',directory],cwd=ROOT,check=True,capture_output=True)
    cases=json.loads((Path(directory)/'fixtures.json').read_text());checks=[]
    for i,case in enumerate(cases):
        spec=importlib.util.spec_from_file_location(f'activation_{i}',Path(directory)/case['module']);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        x=torch.tensor(case['xs'],dtype=torch.float64,requires_grad=True);y=mod.NeuroCurveActivation()(x);dy=torch.autograd.grad(y.sum(),x)[0]
        target=np.array(case['ys']);yv=y.detach().numpy();dv=dy.detach().numpy()
        np.testing.assert_allclose(yv,target[:,0],rtol=3e-11,atol=3e-11)
        np.testing.assert_allclose(dv,target[:,1],rtol=3e-10,atol=3e-10)
        checks.append({'kind':case['definition']['kind'],'name':case['definition'].get('name',case['definition'].get('expression','')),'maxValueError':float(abs(yv-target[:,0]).max()),'maxDerivativeError':float(abs(dv-target[:,1]).max())})
        if case['definition']['kind']=='sketch':
            points=np.array(case['definition']['points']);f=PchipInterpolator(points[:,0],points[:,1]);a,b=points[0,0],points[-1,0];xx=np.array(case['xs']);inside=np.clip(xx,a,b);yy=f(inside);dd=f(inside,1)
            yy=np.where(xx<a,f(a)+(xx-a)*f(a,1),np.where(xx>b,f(b)+(xx-b)*f(b,1),yy));dd=np.where(xx<a,f(a,1),np.where(xx>b,f(b,1),dd))
            np.testing.assert_allclose(yy,target[:,0],rtol=1e-11,atol=1e-11);np.testing.assert_allclose(dd,target[:,1],rtol=1e-11,atol=1e-11)
            checks.append({'kind':'SciPy PCHIP + tangent extrapolation','maxValueError':float(abs(yy-target[:,0]).max()),'maxDerivativeError':float(abs(dd-target[:,1]).max())})
    result={'passed':len(checks),'samplesPerCase':101,'torch':torch.__version__,'precision':'torch.float64 / JS Float64','checks':checks}
    (ROOT/'evidence/reference-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False))
