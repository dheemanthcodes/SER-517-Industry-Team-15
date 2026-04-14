from fastapi import APIRouter


router = APIRouter(tags=["General"])


@router.get("/", summary="Welcome route")
def read_root():
    return {"message": "Backend is running"}
