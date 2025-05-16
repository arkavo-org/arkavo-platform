import os
discourse_dir = os.path.join(current_dir, "discourse")
irc_dir = os.path.join(current_dir, "irc")
thelounge_dir = os.path.join(current_dir, "thelounge")

thelounge = dict(
    image="ghcr.io/thelounge/thelounge:latest",
    name="thelounge",
    detach=True,
    network=NETWORK_NAME,
    volumes={
        thelounge_dir: {
            "bind": "/var/opt/thelounge",
            "mode": "rw",
        },
    },
    restart_policy={
        "Name": "always",
    },
)

irc = dict(
    image="lscr.io/linuxserver/ngircd:latest",
    name="irc",
    detach=True,
    network=NETWORK_NAME,
    environment=dict(PUID=1000, PGID=1000, TZ="Etc/UTC"),
    volumes={
        os.path.join(irc_dir, "config"): {"bind": "/config", "mode": "rw"},
        os.path.join(irc_dir, "config", "ngitcd.motd"): {
            "bind": "/etc/ngircd/ngircd.motd",
            "mode": "rw",
        },
    },
    restart_policy={"Name": "unless-stopped"},
)

discourse = dict(
    image="discourse/discourse:latest",  # Official Discourse image
    name="discourse",
    detach=True,  # Runs the container in detached mode
    restart_policy={
        "Name": "unless-stopped"
    },  # Ensures the container restarts unless manually stopped
    volumes={
        f"{discourse_dir}/data": {
            "bind": "/var/www/discourse/data",
            "mode": "rw",
        },  # Data volume
        f"{discourse_dir}/config/app.yml": {
            "bind": "/var/www/discourse/config/app.yml",
            "mode": "rw",
        },  # Config volume
    },
    network=NETWORK_NAME,  # Ensure it joins the correct network
)
