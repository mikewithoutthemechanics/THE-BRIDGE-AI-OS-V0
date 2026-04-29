import sys


def main():
    sys.stderr.write(
        "This legacy one-off patch script has been retired.\n"
        "Do not rewrite api/index.js via exact string replacement.\n"
        "Apply the intended change directly in api/index.js and commit it through the normal review process.\n"
    )
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
