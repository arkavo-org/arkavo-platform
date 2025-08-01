import env
import util
import utils_docker
from docker.errors import ContainerError

env.webapp_build["detach"] = False

try:
    utils_docker.run_container(env.webapp_build)
except ContainerError as e:
    print(e.stderr.decode() if e.stderr else str(e))
