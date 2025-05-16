import docker
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")

def renew_certificate():
    client = docker.from_env()
    current_dir = os.path.join(os.getcwd(), "live")

    # Ensure the 'live' directory exists in the current directory
    if not os.path.exists(current_dir):
        os.makedirs(current_dir)

    try:
        # Run the Docker container with the specified Certbot renewal command
        client.containers.run(
            "certbot/certbot",
            command="renew --standalone",
            remove=True,
            detach=False,
            tty=True,
            volumes={
                current_dir: {"bind": "/etc/letsencrypt/live", "mode": "rw"}
            }
        )
        logging.info("Certificate renewed successfully.")
    except docker.errors.ContainerError as e:
        logging.error(f"Error running Certbot container: {e}")
    except docker.errors.ImageNotFound:
        logging.error("Certbot image not found. Ensure it is available locally or pull it.")
    except docker.errors.APIError as e:
        logging.error(f"Docker API error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    renew_certificate()
